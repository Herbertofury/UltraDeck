from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.5.0')
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-sites-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def posts(site:str,count=24):
    out=[]
    for i in range(1,count+1):
        if site=='tumblr':
            out.append(f'<div tabindex="-1" data-id="{i}"><article><a href="/post/{i}">Post {i}</a><button data-testid="like" aria-label="Like">Like</button><p>Body {i}</p></article></div>')
        elif site=='x':
            out.append(f'<article data-testid="tweet"><a href="/user/status/{i}">Post {i}</a><button data-testid="like" aria-label="Like">Like</button><p>Body {i}</p></article>')
        else:
            out.append(f'<article data-post-id="{i}"><a href="/posts/example-{i}">Post {i}</a><button aria-label="Like" data-testid="like-button">Like</button><p>Body {i}</p></article>')
    return ''.join(out)

def page_html(host:str):
    if host.startswith('www.tumblr.com'):
        site='tumblr'; nav='<nav role="navigation"><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav>'; timeline=f'<main data-timeline="dashboard">{posts(site)}</main>'; side='<aside role="complementary"><h2>Radar</h2></aside>'
    elif host.startswith('www.patreon.com'):
        site='patreon'; nav='<nav role="navigation"><a href="/home">Home</a><a href="/memberships">Memberships</a><a href="/explore">Explore</a></nav>'; timeline=f'<main role="main">{posts(site)}</main>'; side='<aside role="complementary"><h2>Membership</h2></aside>'
    else:
        site='x'; nav='<nav role="navigation"><a href="/home">Home</a><a href="/explore">Explore</a><a href="/notifications">Notifications</a></nav>'; timeline=f'<main><section aria-label="Timeline: Home">{posts(site)}</section></main>'; side='<aside role="complementary" data-testid="sidebarColumn"><h2>What’s happening</h2></aside>'
    js=f'''<script>(()=>{{const site={json.dumps(site)};window.fixture={{site,likes:{{}},removed:new Map(),suspendRestore:false,remove(id){{let el;if(site==='tumblr')el=document.querySelector(`[data-id="${{id}}"]`);else if(site==='x')el=[...document.querySelectorAll('article')].find(a=>a.querySelector(`a[href*="/status/${{id}}"]`));else el=document.querySelector(`[data-post-id="${{id}}"]`);if(!el)return false;this.removed.set(String(id),{{el,parent:el.parentElement,next:el.nextSibling}});el.remove();return true}},restoreAll(){{for(const [id,x] of [...this.removed]){{if(x.next?.isConnected)x.parent.insertBefore(x.el,x.next);else x.parent.appendChild(x.el);this.removed.delete(id)}}}}}};document.addEventListener('click',e=>{{const b=e.target.closest('button');if(!b||!/like/i.test(`${{b.dataset.testid||''}} ${{b.getAttribute('aria-label')||''}}`))return;const a=site==='tumblr'?b.closest('[data-id]'):b.closest('article');let id='';if(site==='tumblr')id=a?.getAttribute('data-id')||'';else if(site==='x')id=(a?.querySelector('a[href*="/status/"]')?.getAttribute('href')||'').match(/status\\/(\\d+)/)?.[1]||'';else id=a?.getAttribute('data-post-id')||'';fixture.likes[id]=(fixture.likes[id]||0)+1}},true);addEventListener('scroll',()=>{{if(fixture.removed.size&&!fixture.suspendRestore)fixture.restoreAll()}},{{passive:true}});if(site==='tumblr')window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}};}})();</script>'''
    return f'<!doctype html><html><head><meta charset="utf-8"><title>{site}</title></head><body>{nav}{timeline}{side}{js}</body></html>'.encode()

class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        data=page_html(self.headers.get('Host',''))
        self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*a): pass

def extension_id(profile:pathlib.Path):
    end=time.time()+10
    while time.time()<end:
        prefs=profile/'Default'/'Preferences'
        if prefs.is_file():
            try:
                data=json.loads(prefs.read_text())
                for k,v in data.get('extensions',{}).get('settings',{}).items():
                    try:
                        if pathlib.Path(v.get('path','')).resolve()==EXT.resolve(): return k
                    except Exception: pass
            except Exception: pass
        time.sleep(.05)
    raise RuntimeError('UltraDeck extension ID not found')

def run_site(ctx,port,host,path,site):
    errors=[]; p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
    r=p.goto(f'https://{host}:{port}{path}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
    p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}' && window.__UltraDeck.diagnostics().site==='{site}'",timeout=30000)
    p.wait_for_function("window.__UltraDeck.diagnostics().cachedPosts===24",timeout=30000)
    p.evaluate("window.__UltraDeck.setColumns(8)");p.wait_for_function("window.__UltraDeck.diagnostics().renderedColumns===8",timeout=10000)
    # Mounted native action.
    mounted=p.evaluate("window.__UltraDeck.interact('2','like')")
    p.wait_for_function("window.fixture.likes['2']===1",timeout=8000)
    # Physically unmount a far native source, then act without moving the visible retained deck.
    p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop=240")
    before=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    p.evaluate("window.fixture.suspendRestore=true")
    assert p.evaluate("window.fixture.remove('23')")
    p.wait_for_function("!window.__UltraDeck.sourceMounted('23')",timeout=5000)
    p.evaluate("window.fixture.suspendRestore=false")
    result=p.evaluate("window.__UltraDeck.interact('23','like')")
    p.wait_for_function("window.fixture.likes['23']===1",timeout=12000)
    after=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    d=p.evaluate("window.__UltraDeck.diagnostics()")
    assert mounted['ok'] and result['ok'],(site,mounted,result)
    assert before==after,(site,before,after)
    assert d['cachedPosts']==24 and d['renderedColumns']==8 and d['geometryViolations']==0 and d['interactionFailures']==0
    assert not errors,(site,errors)
    return p,{'site':site,'posts':d['cachedPosts'],'columns':d['renderedColumns'],'mountedLike':mounted['ok'],'unmountedLike':result['ok'],'deckScrollDelta':after-before,'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'errors':errors}

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
    browser=ensure_isolated_browser();profile=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-sites-profile-'));runtime=browser_diagnostics();results=[]
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--host-resolver-rules=MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1, MAP twitter.com 127.0.0.1']
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':1920,'height':1080},args=args)
        try:
            _,a=run_site(ctx,port,'www.tumblr.com','/dashboard/following','tumblr');results.append(a)
            _,b=run_site(ctx,port,'www.patreon.com','/home','patreon');results.append(b)
            xpage,c=run_site(ctx,port,'x.com','/home','x');results.append(c)
            # Actual popup against X.
            xpage.bring_to_front();eid=extension_id(profile);popup=ctx.new_page();perr=[];popup.on('pageerror',lambda e:perr.append('pageerror:'+str(e)));popup.on('console',lambda m:perr.append('console:'+m.text) if m.type=='error' else None);popup.goto(f'chrome-extension://{eid}/popup.html',wait_until='domcontentloaded',timeout=30000);xpage.bring_to_front();popup.wait_for_timeout(300)
            popup.locator('#columns').select_option('6');popup.locator('#columns').dispatch_event('change');xpage.wait_for_function("window.__UltraDeck.diagnostics().renderedColumns===6",timeout=10000);popup.wait_for_timeout(150)
            popup_status=popup.locator('#status').inner_text();assert popup_status=='Live · X',popup_status;assert not perr,perr
            out={'browser':runtime,'extensionId':eid,'sites':results,'popup':{'status':popup_status,'xColumns':xpage.evaluate('window.__UltraDeck.diagnostics().renderedColumns'),'errors':perr}}
            print(json.dumps(out,indent=2));assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
