from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,tempfile,threading,sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.4.0')
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v84-context-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def controls(site:str):
    like = '<button data-action="like" data-testid="like" aria-label="Like" aria-pressed="false">Like</button>' if site!='patreon' else '<button data-action="like" data-testid="like-button" aria-label="Like" aria-pressed="false">Like</button>'
    return ''.join([
        like,
        '<button data-action="expand" data-testid="expand" aria-label="Expand thread" aria-expanded="false">Expand</button>',
        '<button data-action="menu" data-testid="caret" aria-label="More" aria-expanded="false">More</button>',
        '<label>Poll <input data-action="poll" data-testid="poll-answer" role="radio" type="radio" aria-checked="false"></label>',
        '<textarea data-testid="reply-draft" aria-label="Reply draft"></textarea>',
        '<button data-action="submit" data-testid="submit-reply" type="submit">Send</button>',
    ])

def posts(site:str,count=18):
    out=[]
    for i in range(1,count+1):
        c=controls(site)
        if site=='tumblr': out.append(f'<div tabindex="-1" data-id="{i}"><article><a href="/post/{i}">Post {i}</a><footer class="actions">{c}</footer><p>Body {i}</p></article></div>')
        elif site=='x': out.append(f'<article data-testid="tweet"><a href="/user/status/{i}"><time>Post {i}</time></a><footer class="actions">{c}</footer><p>Body {i}</p></article>')
        else: out.append(f'<article data-post-id="{i}"><a href="/posts/example-{i}">Post {i}</a><footer class="actions">{c}</footer><p>Body {i}</p></article>')
    return ''.join(out)

def page_html(host:str):
    if host.startswith('www.tumblr.com'):
        site='tumblr'; timeline=f'<main data-timeline="dashboard">{posts(site)}</main>'
    elif host.startswith('www.patreon.com'):
        site='patreon'; timeline=f'<main role="main">{posts(site)}</main>'
    else:
        site='x'; timeline=f'<main><section aria-label="Timeline: Home">{posts(site)}</section></main>'
    nav='<nav role="navigation"><a href="/home">Home</a><a href="/explore">Explore</a></nav>'
    side='<aside role="complementary"><h2>Side</h2></aside>'
    js=f'''<script>(()=>{{
      const site={json.dumps(site)};
      const getPost=(id)=>site==='tumblr'?document.querySelector(`[data-id="${{id}}"]`):site==='x'?[...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>a.querySelector(`a[href*="/status/${{id}}"]`)):document.querySelector(`[data-post-id="${{id}}"]`);
      window.fixture={{events:[],removed:new Map(),getPost,remove(id,dropDraft=false){{const el=getPost(id);if(!el)return false;this.removed.set(String(id),{{el,parent:el.parentElement,next:el.nextSibling}});el.remove();if(dropDraft)el.querySelector('[data-testid="reply-draft"]')?.remove();for(const b of el.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded','false');for(const r of el.querySelectorAll('[role="radio"]')){{r.checked=false;r.setAttribute('aria-checked','false')}}return true}},restoreAll(){{for(const [id,x] of [...this.removed]){{if(x.next?.isConnected)x.parent.insertBefore(x.el,x.next);else x.parent.appendChild(x.el);this.removed.delete(id)}}}}}};
      document.addEventListener('click',e=>{{if(e.target.closest('#tu-ultrawide-deck-shell'))return;const b=e.target.closest('[data-action]');if(!b)return;const a=site==='tumblr'?b.closest('[data-id]'):b.closest('article');let id='';if(site==='tumblr')id=a?.getAttribute('data-id')||'';else if(site==='x')id=(a?.querySelector('a[href*="/status/"]')?.getAttribute('href')||'').match(/status\\/(\\d+)/)?.[1]||'';else id=a?.getAttribute('data-post-id')||'';fixture.events.push([id,b.dataset.action]);if(b.dataset.action==='like'){{const on=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',on?'false':'true')}}if(b.dataset.action==='expand'||b.dataset.action==='menu'){{const on=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',on?'false':'true')}}if(b.dataset.action==='poll'){{b.checked=true;b.setAttribute('aria-checked','true')}}}},true);
      addEventListener('scroll',()=>fixture.restoreAll(),{{passive:true}});
      if(site==='tumblr')window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}};
    }})();</script>'''
    return f'<!doctype html><html><body>{nav}{timeline}{side}{js}</body></html>'.encode()

class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        data=page_html(self.headers.get('Host',''))
        self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*a): pass

def run_site(ctx,port,host,path,site):
    p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
    r=p.goto(f'https://{host}:{port}{path}',wait_until='domcontentloaded',timeout=30000);assert r and r.status==200
    p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}' && window.__UltraDeck.diagnostics().cachedPosts===18",timeout=20000)
    p.evaluate("window.__UltraDeck.setSettings({columns:6,proactiveBuffer:false});document.querySelector('#tu-ultrawide-deck-shell').scrollTop=180")
    base=f'#tu-ultrawide-deck-grid [data-tu-mirror-post="8"]'
    draft=base+' [data-testid="reply-draft"]'; expand=base+' [data-testid="expand"]'; menu=base+' [data-testid="caret"]'; poll=base+' [data-testid="poll-answer"]'; like=base+(' [data-testid="like-button"]' if site=='patreon' else ' [data-testid="like"]')
    p.locator(draft).fill(f'{site} retained draft')
    p.locator(expand).click();p.locator(menu).click();p.locator(poll).click()
    p.wait_for_timeout(260)
    assert p.locator(expand).get_attribute('aria-expanded')=='true',(site,'expand')
    assert p.locator(menu).get_attribute('aria-expanded')=='true',(site,'menu')
    assert p.locator(poll).is_checked(),(site,'poll')
    info=p.evaluate("window.__UltraDeck.postInfo('8')");assert info and info.get('contextControls',0)>=4,(site,info)
    # Recycle the native card, deliberately remove the native textarea, and reset native contextual
    # toggles. The retained UltraDeck card must keep the user's contextual UI/draft and still accept
    # a native-backed action without scrolling to the source.
    assert p.evaluate("fixture.remove('8',true)")
    p.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)")
    p.wait_for_timeout(180)
    before=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    p.locator(like).click(timeout=5000)
    p.wait_for_function("()=>fixture.events.some(x=>x[0]==='8'&&x[1]==='like')",timeout=10000)
    p.wait_for_timeout(240)
    after=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    assert p.locator(draft).count()==1,(site,'draft-control-lost')
    assert p.locator(draft).input_value()==f'{site} retained draft',(site,p.locator(draft).input_value())
    assert p.locator(expand).get_attribute('aria-expanded')=='true',(site,'expand-lost')
    assert p.locator(menu).get_attribute('aria-expanded')=='true',(site,'menu-lost')
    assert p.locator(poll).is_checked(),(site,'poll-lost')
    assert before==after,(site,before,after)
    d=p.evaluate("window.__UltraDeck.diagnostics(true)")
    assert d.get('interactionContextStickyPreserves',0)>=1,(site,d)
    assert d.get('interactionContextSessionSaves',0)>=1,(site,d)
    assert d.get('interactionFailures',0)==0,(site,d)
    assert not errors,(site,errors)
    # Session reload must restore contextual state from sessionStorage when the matching controls
    # exist again, proving SPA/reload continuity rather than only in-memory clone preservation.
    p.reload(wait_until='domcontentloaded',timeout=30000)
    p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}' && window.__UltraDeck.diagnostics().cachedPosts===18",timeout=20000)
    assert p.locator(draft).input_value()==f'{site} retained draft',(site,'reload-draft')
    assert p.locator(expand).get_attribute('aria-expanded')=='true',(site,'reload-expand')
    assert p.locator(menu).get_attribute('aria-expanded')=='true',(site,'reload-menu')
    assert p.locator(poll).is_checked(),(site,'reload-poll')
    d2=p.evaluate("window.__UltraDeck.diagnostics(true)")
    out={'site':site,'contextControls':p.evaluate("window.__UltraDeck.postInfo('8').contextControls"),'stickyPreserves':d.get('interactionContextStickyPreserves',0),'contextRestores':d2.get('interactionContextRestores',0),'sessionLoads':d2.get('interactionContextSessionLoads',0),'sessionSavesBeforeReload':d.get('interactionContextSessionSaves',0),'deckScrollDelta':after-before,'failures':d2.get('interactionFailures',0),'errors':errors}
    p.close();return out

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
    browser=ensure_isolated_browser();runtime=browser_diagnostics();profile=tempfile.mkdtemp(prefix='ud-v84-context-profile-')
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--host-resolver-rules=MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1, MAP twitter.com 127.0.0.1']
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':2560,'height':1080},args=args)
        try:
            results=[run_site(ctx,port,'www.tumblr.com','/dashboard','tumblr'),run_site(ctx,port,'www.patreon.com','/home','patreon'),run_site(ctx,port,'x.com','/home','x')]
            print(json.dumps({'browser':runtime,'results':results},indent=2));assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
