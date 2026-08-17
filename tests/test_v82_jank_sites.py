from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,subprocess,tempfile,threading,sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
import os
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve(); VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.5.0')
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud82cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def html(site):
    nav='<nav role="navigation"><a href="/home">Home</a></nav>'
    side='<aside role="complementary">Side</aside>'
    if site=='patreon':
        posts=''.join(f'<div role="article"><a class="perma" href="/posts/title-{1000+i}">Post {i}</a><a class="noise" href="/settings?x={i}">noise</a><button aria-label="Like">Like</button><p>Body</p></div>' for i in range(12))
        main=f'<main role="main">{posts}</main>'
    elif site=='x':
        posts=''.join(f'''<article data-testid="tweet"><div class="quote"><a href="/quoted/status/{9000+i}">quoted</a></div><a class="ts" href="/user/status/{2000+i}"><time>now</time></a><a class="noise" href="/explore?x={i}">noise</a><button data-testid="like" aria-label="Like">Like</button><p>Body</p></article>''' for i in range(12))
        main=f'<main><section aria-label="Timeline: Home">{posts}</section></main>'
    else:
        posts=''.join(f'<div tabindex="-1" data-id="{3000+i}"><article><a href="/post/{3000+i}">Post</a><button data-testid="like">Like</button><p>Body</p></article></div>' for i in range(12))
        main=f'<main data-timeline="x">{posts}</main><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script>'
    js='''<script>window.likes=0;document.addEventListener('click',e=>{if(e.target.closest('button'))window.likes++},true)</script>'''
    return f'<!doctype html><html><body>{nav}{main}{side}{js}</body></html>'.encode()
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        host=self.headers.get('Host','');site='patreon' if 'patreon' in host else 'x' if ('x.com' in host or 'twitter' in host) else 'tumblr';d=html(site);self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(d)));self.end_headers();self.wfile.write(d)
    def log_message(self,*a):pass
socketserver.ThreadingTCPServer.daemon_threads=True
srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
browser=ensure_isolated_browser();results={}
with sync_playwright() as pw:
    ctx=pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ud82profile-'),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--host-resolver-rules=MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1, MAP twitter.com 127.0.0.1'])
    try:
      for site,host,path,firstid in [('tumblr','www.tumblr.com','/dashboard',3000),('patreon','www.patreon.com','/home',1000),('x','x.com','/home',2000)]:
        p=ctx.new_page();errs=[];p.on('pageerror',lambda e,errs=errs:errs.append(str(e)));p.on('console',lambda m,errs=errs: errs.append(m.text) if m.type=='error' else None)
        r=p.goto(f'https://{host}:{port}{path}',wait_until='domcontentloaded',timeout=20000);assert r and r.status==200
        p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}'",timeout=10000)
        p.wait_for_function("window.__UltraDeck.diagnostics().cachedPosts===12",timeout=15000)
        d0=p.evaluate('window.__UltraDeck.diagnostics()')
        if site in ('patreon','x'):
          got=p.evaluate(f"window.__UltraDeck.postInfo('{firstid}')")
          assert got,(site,firstid,d0)
          # 96 irrelevant href churns should all take the early-skip path.
          p.evaluate("""()=>{const a=document.querySelector('a.noise'); for(let i=0;i<96;i++) a.setAttribute('href','/explore?noise='+i)}""")
          p.wait_for_timeout(150)
        if site=='x':
          assert p.evaluate("window.__UltraDeck.postInfo('2000')")
          assert not p.evaluate("window.__UltraDeck.postInfo('9000')")
        act=p.evaluate(f"window.__UltraDeck.interact('{firstid}','like')")
        p.wait_for_function('window.likes===1',timeout=5000)
        d=p.evaluate('window.__UltraDeck.diagnostics()')
        results[site]={'cached':d['cachedPosts'],'columns':d['renderedColumns'],'identityMutationSkips':d.get('identityMutationSkips',0),'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'like':act.get('ok'),'errors':errs}
        assert d['cachedPosts']==12 and d['geometryViolations']==0 and d['interactionFailures']==0 and act.get('ok') and not errs,(site,results[site])
        if site in ('patreon','x'): assert d.get('identityMutationSkips',0)>=1,(site,d.get('identityMutationSkips'))
        p.close()
    finally:ctx.close();srv.shutdown();srv.server_close()
out={'browser':browser_diagnostics(),'results':results};print(json.dumps(out,indent=2));assert out['browser']['policyIsolated'] and not out['browser']['hostPoliciesModified']
