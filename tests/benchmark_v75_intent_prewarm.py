from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve(); CAND=pathlib.Path(sys.argv[2]).resolve(); REVERSE='--reverse' in sys.argv[3:]
RUNS=int(os.environ.get('ULTRADECK_RUNS','8'))
HTML=(ROOT/'tests/fixtures/tumblr_fixture.html').read_bytes()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-intent-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def handle(self):
        try: super().handle()
        except (BrokenPipeError,ConnectionResetError,ssl.SSLError,OSError): pass
    def do_GET(self):
        data=(b'<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"/>') if self.path.startswith('/img/') else HTML
        self.send_response(200); self.send_header('Content-Type','image/svg+xml' if self.path.startswith('/img/') else 'text/html'); self.send_header('Content-Length',str(len(data))); self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError,ssl.SSLError,OSError):pass
    def log_message(self,*a):pass

def run(label,ext,version,port,browser):
    rows=[]; profile=tempfile.mkdtemp(prefix=f'ud-intent-{label}-')
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
        try:
            for i in range(RUNS):
                p=ctx.new_page(); errors=[]; p.on('pageerror',lambda e:errors.append(str(e)))
                p.goto(f'https://www.tumblr.com:{port}/dashboard/stuff_for_you?{label}={i}',wait_until='domcontentloaded',timeout=60000)
                p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000)
                p.evaluate("()=>window.__TumblrUltraWideDeck.buffer(80)")
                p.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=80 && window.__TumblrUltraWideDeck.diagnostics().postBuildQueued===0",timeout=45000)
                p.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)'); p.wait_for_timeout(220)
                p.wait_for_function("!window.__TumblrUltraWideDeck.sourceMounted('1')",timeout=10000)
                p.evaluate("const s=document.querySelector('#tu-ultrawide-deck-shell');s.scrollTop=0")
                p.wait_for_timeout(80)
                p.evaluate("""()=>{window.__udUp=0;window.__udNative=0;const g=document.querySelector('#tu-ultrawide-deck-grid');g.addEventListener('pointerup',e=>{if(e.target.closest('[data-tu-mirror-post=\"1\"] [data-testid=like]'))window.__udUp=performance.now()},{capture:true,once:true});const ev=fixture.events;const push=ev.push.bind(ev);ev.push=(...args)=>{if(args[0]?.[0]==='like'&&args[0]?.[1]==='1')window.__udNative=performance.now();return push(...args)}}""")
                loc=p.locator('#tu-ultrawide-deck-grid [data-tu-mirror-post="1"] [data-testid=like]'); box=loc.bounding_box(); assert box
                p.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2); p.mouse.down(); p.wait_for_timeout(90); p.mouse.up()
                p.wait_for_function('window.__udNative>0',timeout=5000)
                vals=p.evaluate("()=>({up:window.__udUp,native:window.__udNative,source:__TumblrUltraWideDeck.sourceMounted('1'),diag:__TumblrUltraWideDeck.diagnostics()})")
                delta=vals['native']-vals['up']; assert vals['up']>0 and delta>=0 and not errors
                rows.append({'releaseToNativeMs':round(delta,3),'prewarms':vals['diag'].get('interactionIntentPrewarms',0),'hits':vals['diag'].get('interactionIntentPrewarmHits',0),'failures':vals['diag']['interactionFailures']})
                p.close()
        finally:ctx.close()
    v=[r['releaseToNativeMs'] for r in rows]
    return {'label':label,'version':version,'rows':rows,'mean':round(statistics.mean(v),3),'median':round(statistics.median(v),3),'p90':round(sorted(v)[max(0,int(len(v)*.9)-1)],3),'max':round(max(v),3)}

def main():
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H); srv.daemon_threads=True; tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]; browser=ensure_isolated_browser()
    order=[('candidate',CAND,'7.5.0'),('base',BASE,'7.4.0')] if REVERSE else [('base',BASE,'7.4.0'),('candidate',CAND,'7.5.0')]
    try:r=[run(l,e,v,port,browser) for l,e,v in order]
    finally:srv.shutdown();srv.server_close()
    by={x['label']:x for x in r}; b=by['base']; c=by['candidate']
    print(json.dumps({'browser':browser_diagnostics(),'reverse':REVERSE,'runs':RUNS,'results':r,'improvementPct':{'mean':round((b['mean']-c['mean'])/b['mean']*100,2),'median':round((b['median']-c['median'])/b['median']*100,2)}},indent=2))
if __name__=='__main__':main()
