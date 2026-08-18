from __future__ import annotations
import http.server, json, os, pathlib, socketserver, ssl, subprocess, tempfile, threading, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics

EXT = pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR', str(ROOT / 'dist-manual/chromium-mv3'))).resolve()
VERSION = os.environ.get('ULTRADECK_EXPECT_VERSION', '8.6.0')
OUT = pathlib.Path(os.environ.get('ULTRADECK_VISUAL_OUT', str(ROOT / 'artifacts/visual-verification'))).resolve()
OUT.mkdir(parents=True, exist_ok=True)
CERT = pathlib.Path(tempfile.mkdtemp(prefix='ud-v86-visual-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

BASE_CSS = '''
*{box-sizing:border-box}html,body{margin:0;background:#0e0e0f;color:#ececf0;font:14px system-ui,sans-serif}a{color:inherit}button{font:inherit}.site-header{position:fixed;z-index:20;top:0;left:0;right:0;height:58px;background:#111214;border-bottom:1px solid #2a2b2e;display:flex;align-items:center;justify-content:center;gap:32px}.site-header a{font-weight:700;text-decoration:none}.feed{width:min(720px,70vw);margin:0 auto}.card{background:#18191c;border:1px solid #303237;border-radius:10px;margin:12px 0;padding:18px;min-height:180px}.card h2{margin:0 0 10px;font-size:18px}.card p{line-height:1.45;color:#c7c8cd}.actions{display:flex;gap:12px;margin-top:14px}.actions button{background:#25272b;color:#fff;border:1px solid #3a3d43;border-radius:20px;padding:7px 12px}
'''

def tumblr_html() -> str:
    posts=''.join(f'''<div tabindex="-1" data-id="{1000+i}"><article class="card"><h2>Tumblr post {i}</h2><p>Retained post content used for visual regression verification.</p><div class="actions"><button data-testid="like">Like</button><button data-testid="reblog">Reblog</button></div></article></div>''' for i in range(1,10))
    return f'''<!doctype html><html><head><title>Tumblr Dashboard</title><style>{BASE_CSS}
    .tumblr-tabs{{position:fixed;z-index:21;top:0;left:50%;transform:translateX(-50%);height:70px;width:500px;background:#101112;display:flex;align-items:center;justify-content:space-around;border-bottom:1px solid #2a2b2e}}
    .tumblr-filter{{position:fixed;z-index:21;top:78px;left:calc(50% - 230px);height:42px;padding:8px 14px;border:2px solid #00b8ff;border-radius:18px;color:#00b8ff}}
    .oversized-route-control{{position:fixed;z-index:19;top:70px;left:calc(50% - 260px);width:520px;height:190px;pointer-events:none}}
    .oversized-route-control a{{position:absolute;bottom:0;left:0}}.feed{{padding-top:132px}}
    </style></head><body><nav class="tumblr-tabs"><a href="/dashboard/following">Following</a><a href="/dashboard/stuff_for_you">For you</a><a href="/dashboard/hubs">Your tags</a><a href="/dashboard/missed_posts">What you missed</a></nav><button class="tumblr-filter">Filter by tag</button><div class="oversized-route-control"><a href="/tagged/test">route utility sentinel</a></div><main data-timeline="dashboard" data-timeline-id="stuff_for_you" class="feed">{posts}</main></body></html>'''

def patreon_html() -> str:
    posts=''.join(f'''<article class="card" data-post-id="{22000+i}"><a href="/posts/member-update-{22000+i}"><h2>Patreon post {i}</h2></a><p>Creator post body and media metadata.</p><img alt="preview" width="320" height="80"><div class="actions"><button aria-label="Like">Like</button><button aria-label="Comment">Comment</button><button aria-label="Share">Share</button></div></article>''' for i in range(1,9))
    return f'''<!doctype html><html><head><title>Patreon Home</title><style>{BASE_CSS}.feed{{padding-top:72px}}</style></head><body><header class="site-header"><a href="/home">Home</a><a href="/memberships">Memberships</a><button aria-label="Filter">Filter</button></header><main role="main" class="feed">{posts}</main></body></html>'''

def x_html() -> str:
    tweets=''.join(f'''<article data-testid="tweet" class="card"><a href="/tester/status/{330000+i}"><time>now</time></a><div data-testid="tweetText"><h2>X post {i}</h2><p>Timeline content retained without touching verification pages.</p></div><div class="actions"><button data-testid="like">Like</button><button data-testid="retweet">Repost</button><button data-testid="reply">Reply</button></div></article>''' for i in range(1,9))
    return f'''<!doctype html><html><head><title>Home / X</title><style>{BASE_CSS}.feed{{padding-top:68px}}</style></head><body><div id="react-root"><header class="site-header"><a href="/home">Home</a><a href="/explore">Explore</a></header><main role="main"><div data-testid="primaryColumn" class="feed"><section aria-label="Timeline: Your Home Timeline">{tweets}</section></div></main></div></body></html>'''

def challenge_html() -> str:
    return f'''<!doctype html><html><head><title>Just a moment...</title><style>{BASE_CSS}.challenge{{margin:180px auto;width:620px;text-align:center}}</style></head><body><main id="challenge-running" class="challenge"><h1>Checking your browser before accessing x.com</h1><p>Cloudflare verification fixture. UltraDeck must remain inactive here.</p></main><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>'''

def tiktok_html() -> str:
    posts=''.join(f'''<div data-e2e="recommend-list-item-container" data-video-id="{4400000000000000000+i}" class="card"><a href="/@tester/video/{4400000000000000000+i}"><h2>TikTok video {i}</h2></a><div class="xgplayer-container" id="xgwrapper-0-{4400000000000000000+i}"><video muted></video></div><section class="x-SectionActionBarContainer actions"><button data-e2e="like-icon">Like</button><button data-e2e="comment-icon">Comment</button><button data-e2e="share-icon">Share</button></section></div>''' for i in range(1,8))
    return f'''<!doctype html><html><head><title>TikTok For You</title><style>{BASE_CSS}.feed{{padding-top:70px}}</style></head><body><div id="app"><header class="site-header"><a href="/foryou">For You</a><a href="/following">Following</a></header><main data-e2e="recommend-list" class="feed">{posts}</main></div></body></html>'''

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        host=(self.headers.get('Host') or '').split(':',1)[0].lower()
        if self.path.startswith('/cdn-cgi/challenge-platform/'):
            data=b'/* challenge fixture */'; ctype='application/javascript'
        elif host in ('x.com','twitter.com') and self.path.startswith('/challenge'): data=challenge_html().encode(); ctype='text/html'
        elif host=='www.tumblr.com': data=tumblr_html().encode(); ctype='text/html'
        elif host=='www.patreon.com': data=patreon_html().encode(); ctype='text/html'
        elif host in ('x.com','twitter.com'): data=x_html().encode(); ctype='text/html'
        elif host.endswith('tiktok.com'): data=tiktok_html().encode(); ctype='text/html'
        else: data=b'not found'; ctype='text/plain'
        self.send_response(200); self.send_header('Content-Type',ctype); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self,*args): pass

def extension_id(profile:pathlib.Path):
    end=time.time()+10
    while time.time()<end:
        prefs=profile/'Default'/'Preferences'
        if prefs.is_file():
            try:
                data=json.loads(prefs.read_text())
                for key,value in data.get('extensions',{}).get('settings',{}).items():
                    try:
                        if pathlib.Path(value.get('path','')).resolve()==EXT.resolve(): return key
                    except Exception: pass
            except Exception: pass
        time.sleep(.05)
    return None

def measure(page):
    return page.evaluate('''() => { const shell=document.querySelector('#tu-ultrawide-deck-shell'); const d=window.__UltraDeck?.diagnostics?.(true)||window.__UltraDeck?.getState?.()?.diagnostics||{}; return {version:window.__UltraDeck?.version||null, shellTop:shell?shell.getBoundingClientRect().top:null, shellPresent:!!shell, cachedPosts:d.cachedPosts??null, deckTop:d.deckTop??null, topAnchorSource:d.topAnchorSource??null, gate:document.documentElement.dataset.tuSiteEnabled||null, site:window.__UltraDeck?.site||d.site||null}; }''')

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H)
    tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain(CERT/'c',CERT/'k'); srv.socket=tls.wrap_socket(srv.socket,server_side=True)
    threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]
    browser=ensure_isolated_browser(); runtime=browser_diagnostics(); profile=pathlib.Path(tempfile.mkdtemp(prefix='ud-v86-visual-profile-'))
    resolver='MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1, MAP twitter.com 127.0.0.1, MAP www.tiktok.com 127.0.0.1'
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox',f'--host-resolver-rules={resolver}']
    results={}
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':2048,'height':1080},args=args)
        try:
            cases=[('tumblr',f'https://www.tumblr.com:{port}/dashboard/stuff_for_you',154,8),('patreon',f'https://www.patreon.com:{port}/home',156,7),('x',f'https://x.com:{port}/home',132,7),('tiktok',f'https://www.tiktok.com:{port}/foryou',None,6)]
            for name,url,top_cap,min_posts in cases:
                page=ctx.new_page(); console=[]
                page.on('console',lambda msg,c=console: c.append(f'{msg.type}: {msg.text}'))
                page.goto(url,wait_until='domcontentloaded',timeout=30000)
                page.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}'",timeout=20000)
                page.wait_for_function(f"(window.__UltraDeck?.diagnostics?.(true)?.cachedPosts||0)>={min_posts}",timeout=20000)
                page.wait_for_timeout(900); data=measure(page)
                if top_cap is not None:
                    assert data['deckTop'] is not None and data['deckTop'] <= top_cap, (name,data)
                    assert data['shellTop'] is not None and data['shellTop'] <= top_cap + 1, (name,data)
                assert (data['cachedPosts'] or 0) >= min_posts, (name,data)
                path=OUT/f'{name}-verified.png'; page.screenshot(path=str(path),full_page=False)
                data.update({'screenshot':str(path),'consoleErrors':[x for x in console if x.startswith('error:')]}); results[name]=data; page.close()

            challenge=ctx.new_page(); cconsole=[]; challenge.on('console',lambda msg: cconsole.append(f'{msg.type}: {msg.text}'))
            challenge.goto(f'https://x.com:{port}/challenge',wait_until='domcontentloaded',timeout=30000); challenge.wait_for_timeout(1800)
            challenge_state=challenge.evaluate('''() => ({runtime:!!window.__UltraDeck,shell:!!document.querySelector('#tu-ultrawide-deck-shell'),gate:document.documentElement.dataset.tuSiteEnabled||null,siteId:document.documentElement.dataset.tuSiteId||null,title:document.title})''')
            assert challenge_state['runtime'] is False and challenge_state['shell'] is False, challenge_state
            assert challenge_state['gate'] is None and challenge_state['siteId'] is None, challenge_state
            cpath=OUT/'x-cloudflare-safe.png'; challenge.screenshot(path=str(cpath),full_page=False); challenge.close()
            challenge_state.update({'screenshot':str(cpath),'consoleErrors':[x for x in cconsole if x.startswith('error:')]}); results['x-cloudflare']=challenge_state

            report={'version':VERSION,'browser':runtime,'extensionId':extension_id(profile),'results':results}
            (OUT/'visual-verification.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))
            assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:
            ctx.close(); srv.shutdown(); srv.server_close()

if __name__=='__main__': main()
