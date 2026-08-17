from __future__ import annotations
import http.server, json, pathlib, socketserver, ssl, statistics, subprocess, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics

V73 = pathlib.Path('/mnt/data/UltraDeck-Project/source/UltraDeck-Tumblr-Extension-v7.3.0/dist-manual/chromium-mv3')
V74 = ROOT / 'dist-manual/chromium-mv3'
SEQUENCE = [6, 12, 20, 8, 16, 20]
POST_COUNT = 200
RUNS_PER_VERSION = 5

CERTDIR = pathlib.Path(tempfile.mkdtemp(prefix='ud-73-74-cert-'))
subprocess.run([
    'openssl','req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',str(CERTDIR/'key.pem'),'-out',str(CERTDIR/'cert.pem'),
    '-days','1','-subj','/CN=www.tumblr.com'
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

POSTS = ''.join(
    f'''<div tabindex="-1" data-id="{i}"><article style="min-height:{180 + (i * 73) % 560}px"><figure><div style="height:{150 + (i * 47) % 430}px;background:#234"></div></figure><p>Post {i} {'long content ' * 40 if i % 3 == 0 else ''}</p><button data-testid="like">Like</button></article></div>'''
    for i in range(1, POST_COUNT + 1)
)
HTML = f'''<!doctype html><html><head><meta charset="utf-8"><title>UltraDeck A/B</title></head><body>
<nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav>
<main data-timeline="/api/v2/timeline/dashboard">{POSTS}</main>
<aside aria-label="Sidebar"><h2>Radar</h2></aside>
<script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}};</script>
</body></html>'''.encode()

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)
    def log_message(self, *args):
        pass


def mean(values):
    return round(statistics.mean(values), 2)

def median(values):
    return round(statistics.median(values), 2)

def percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * fraction
    lo = int(position)
    hi = min(lo + 1, len(ordered) - 1)
    part = position - lo
    return round(ordered[lo] * (1 - part) + ordered[hi] * part, 2)


def bridge_command_ms(page, columns, request_id):
    return page.evaluate('''async ({columns, requestId}) => {
        const started = performance.now();
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { cleanup(); reject(new Error('state timeout')); }, 8000);
            const onState = (event) => {
                let detail = null;
                try { detail = JSON.parse(String(event.detail || '{}')); } catch {}
                if (!detail || detail.requestId !== requestId) return;
                cleanup();
                resolve(performance.now() - started);
            };
            const cleanup = () => { clearTimeout(timer); document.removeEventListener('ultradeck:state', onState, true); };
            document.addEventListener('ultradeck:state', onState, true);
            document.dispatchEvent(new CustomEvent('ultradeck:command', {
                detail: JSON.stringify({type:'setColumns', value:columns, requestId})
            }));
        });
    }''', {'columns': columns, 'requestId': request_id})


def overlaps(page):
    return page.evaluate('''() => {
        let bad = 0;
        for (const col of document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column')) {
            const rects = [...col.querySelectorAll(':scope > .tu-item')]
                .map(el => el.getBoundingClientRect()).sort((a,b) => a.top-b.top);
            for (let i=1;i<rects.length;i++) if (rects[i-1].bottom > rects[i].top - 1) bad++;
        }
        return bad;
    }''')


def run_case(label, ext, version, port, browser, ordinal):
    profile = pathlib.Path(tempfile.mkdtemp(prefix=f'ud-ab-{label}-{ordinal}-'))
    errors = []
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            str(profile), executable_path=str(browser), headless=True, ignore_https_errors=True,
            viewport={'width':3440,'height':1200},
            args=[
                f'--disable-extensions-except={ext}', f'--load-extension={ext}', '--no-sandbox',
                '--disable-background-timer-throttling','--disable-renderer-backgrounding',
                f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'
            ]
        )
        try:
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
            page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
            t0 = time.perf_counter()
            response = page.goto(f'https://www.tumblr.com:{port}/dashboard/following', wait_until='domcontentloaded', timeout=60000)
            assert response and response.status == 200
            page.wait_for_function(f"window.__TumblrUltraWideDeck?.version === '{version}'", timeout=20000)
            runtime_ms = (time.perf_counter() - t0) * 1000
            page.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length >= {POST_COUNT}", timeout=30000)
            ready_ms = (time.perf_counter() - t0) * 1000
            page.wait_for_timeout(250)
            initial = page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')

            # Measure the synchronous rebuild work entirely in-page, avoiding CDP polling overhead.
            sync_transitions = []
            for n in SEQUENCE:
                duration = page.evaluate('''n => {
                    const t = performance.now();
                    window.__TumblrUltraWideDeck.setColumns(n);
                    return performance.now() - t;
                }''', n)
                page.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column').length === {n}", timeout=5000)
                page.wait_for_timeout(120)
                sync_transitions.append(round(duration, 3))

            # Measure the command/state bridge itself, including state serialization. This is the
            # path the real popup exercises; the separate E2E test click-tests the actual popup UI.
            bridge = []
            for idx, n in enumerate(SEQUENCE):
                duration = bridge_command_ms(page, n, f'{label}-{ordinal}-{idx}-{time.time_ns()}')
                page.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column').length === {n}", timeout=5000)
                page.wait_for_timeout(80)
                bridge.append(round(float(duration), 3))

            final = page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
            retained = page.locator('#tu-ultrawide-deck-grid .tu-item').count()
            result = {
                'label':label, 'version':version, 'run':ordinal,
                'runtimeMs':round(runtime_ms,2), 'ready200Ms':round(ready_ms,2),
                'retained':retained,
                'initialLongTaskCount':initial['longTaskCount'],
                'initialLongTaskMs':initial['longTaskMs'],
                'syncTransitionMs':sync_transitions,
                'syncTransitionMeanMs':round(statistics.mean(sync_transitions),3),
                'syncTransitionMaxMs':round(max(sync_transitions),3),
                'bridgeCommandMs':bridge,
                'bridgeCommandMeanMs':round(statistics.mean(bridge),3),
                'bridgeCommandMaxMs':round(max(bridge),3),
                'geometryViolations':final['geometryViolations'],
                'interactionFailures':final['interactionFailures'],
                'overlaps':overlaps(page),
                'renderedColumns':final['renderedColumns'],
                'topDiscoveryRuns':final.get('topDiscoveryRuns'),
                'railDiscoveryRuns':final.get('railDiscoveryRuns'),
                'incrementalHarvests':final.get('incrementalHarvests'),
                'errors':errors,
            }
            assert result['retained'] == POST_COUNT
            assert result['geometryViolations'] == 0
            assert result['interactionFailures'] == 0
            assert result['overlaps'] == 0
            assert result['renderedColumns'] == 20
            assert not errors
            return result
        finally:
            context.close()


def summarize(rows):
    metrics = ['runtimeMs','ready200Ms','initialLongTaskMs','syncTransitionMeanMs','syncTransitionMaxMs','bridgeCommandMeanMs','bridgeCommandMaxMs']
    out = {}
    for metric in metrics:
        values = [float(row[metric]) for row in rows]
        out[metric] = {'mean':mean(values),'median':median(values),'p90':percentile(values,.90),'min':round(min(values),2),'max':round(max(values),2)}
    out['allRetained'] = all(r['retained'] == POST_COUNT for r in rows)
    out['allGeometryClean'] = all(r['geometryViolations'] == 0 and r['overlaps'] == 0 for r in rows)
    out['allInteractionsClean'] = all(r['interactionFailures'] == 0 for r in rows)
    out['allConsoleClean'] = all(not r['errors'] for r in rows)
    return out


def pct(base, new):
    return round((base - new) / base * 100, 2) if base else None


def main():
    for path in (V73, V74):
        if not (path / 'manifest.json').is_file():
            raise FileNotFoundError(path)
    socketserver.ThreadingTCPServer.daemon_threads = True
    server = socketserver.ThreadingTCPServer(('127.0.0.1',0), Handler)
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(CERTDIR/'cert.pem', CERTDIR/'key.pem')
    server.socket = tls.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    browser = ensure_isolated_browser()
    browser_info = browser_diagnostics()
    rows = []
    try:
        # Alternate order so warm/cold host conditions do not always favor the same version.
        for run in range(1, RUNS_PER_VERSION + 1):
            order = [
                ('v7.3.0', V73, '7.3.0'),
                ('v7.4.0', V74, '7.4.0')
            ] if run % 2 else [
                ('v7.4.0', V74, '7.4.0'),
                ('v7.3.0', V73, '7.3.0')
            ]
            for label, ext, version in order:
                row = run_case(label, ext, version, port, browser, run)
                rows.append(row)
                print(json.dumps(row), flush=True)
    finally:
        server.shutdown(); server.server_close()

    v73 = [r for r in rows if r['version'] == '7.3.0']
    v74 = [r for r in rows if r['version'] == '7.4.0']
    s73, s74 = summarize(v73), summarize(v74)
    improvements = {}
    for metric in ['runtimeMs','ready200Ms','initialLongTaskMs','syncTransitionMeanMs','syncTransitionMaxMs','bridgeCommandMeanMs','bridgeCommandMaxMs']:
        improvements[metric+'MeanPct'] = pct(s73[metric]['mean'], s74[metric]['mean'])
        improvements[metric+'MedianPct'] = pct(s73[metric]['median'], s74[metric]['median'])
    output = {
        'schema':'ultradeck.performance-ab/3',
        'browser':browser_info,
        'runsPerVersion':RUNS_PER_VERSION,
        'postCount':POST_COUNT,
        'sequence':SEQUENCE,
        'v7.3.0':s73,
        'v7.4.0':s74,
        'improvementPositiveMeansFasterPct':improvements,
        'runs':rows,
    }
    target = ROOT/'dist/UltraDeck-v7.4.0-conventional-ab.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(output, indent=2))

if __name__ == '__main__':
    main()
