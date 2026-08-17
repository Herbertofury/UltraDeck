from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,tempfile,threading,sys,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.4.0')
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v83-capsule-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def controls(site:str):
    if site=='tumblr':
        return ''.join([
            '<button data-action="like" data-testid="like" aria-label="Like">Like</button>',
            '<button data-action="reblog" data-testid="reblog" aria-label="Reblog">Reblog</button>',
            '<button data-action="reply" data-testid="reply" aria-label="Reply">Reply</button>',
            '<button data-action="share" data-testid="share" aria-label="Share">Share</button>',
        ])
    if site=='x':
        return ''.join([
            '<button data-action="like" data-testid="like" aria-label="Like">Like</button>',
            '<button data-action="repost" data-testid="retweet" aria-label="Repost">Repost</button>',
            '<button data-action="reply" data-testid="reply" aria-label="Reply">Reply</button>',
            '<button data-action="share" data-testid="share" aria-label="Share">Share</button>',
        ])
    return ''.join([
        '<button data-action="like" data-testid="like-button" aria-label="Like">Like</button>',
        '<button data-action="repost" data-testid="repost-button" aria-label="Repost">Repost</button>',
        '<button data-action="reply" data-testid="comment-button" aria-label="Comment">Comment</button>',
        '<button data-action="share" data-testid="share-button" aria-label="Share">Share</button>',
    ])

def posts(site:str,count=32):
    out=[]
    for i in range(1,count+1):
        c=controls(site)
        if site=='tumblr': out.append(f'<div tabindex="-1" data-id="{i}"><article><a href="/post/{i}">Post {i}</a><footer class="actions">{c}</footer><p>Body {i}</p></article></div>')
        elif site=='x': out.append(f'<article data-testid="tweet"><a href="/user/status/{i}"><time>Post {i}</time></a><footer class="actions">{c}</footer><p>Body {i}</p></article>')
        else: out.append(f'<article data-post-id="{i}"><a href="/posts/example-{i}">Post {i}</a><footer class="actions">{c}</footer><p>Body {i}</p></article>')
    return ''.join(out)

def page_html(host:str):
    if host.startswith('www.tumblr.com'):
        site='tumblr';timeline=f'<main data-timeline="dashboard">{posts(site)}</main>'
    elif host.startswith('www.patreon.com'):
        site='patreon';timeline=f'<main role="main">{posts(site)}</main>'
    else:
        site='x';timeline=f'<main><section aria-label="Timeline: Home">{posts(site)}</section></main>'
    nav='<nav role="navigation"><a href="/home">Home</a><a href="/explore">Explore</a><a href="/notifications">Notifications</a></nav>'
    side='<aside role="complementary"><h2>Side</h2></aside>'
    js=f'''<script>(()=>{{
      const site={json.dumps(site)};
      const getPost=(id)=>site==='tumblr'?document.querySelector(`[data-id="${{id}}"]`):site==='x'?[...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>a.querySelector(`a[href*="/status/${{id}}"]`)):document.querySelector(`[data-post-id="${{id}}"]`);
      window.fixture={{events:[],removed:new Map(),suspendRestore:false,restoreDelayMs:0,restoreTimer:0,remove(id,reshape=false){{const el=getPost(id);if(!el)return false;this.removed.set(String(id),{{el,parent:el.parentElement,next:el.nextSibling}});el.remove();if(reshape){{for(const b of el.querySelectorAll('button[data-action]')){{const w=document.createElement('span');w.className='framework-remount-wrapper';b.parentElement.insertBefore(w,b);w.appendChild(b)}}}}return true}},restoreAll(){{for(const [id,x] of [...this.removed]){{if(x.next?.isConnected)x.parent.insertBefore(x.el,x.next);else x.parent.appendChild(x.el);this.removed.delete(id)}}}}}};
      document.addEventListener('click',e=>{{if(e.target.closest('#tu-ultrawide-deck-shell'))return;const b=e.target.closest('button[data-action]');if(!b)return;const a=site==='tumblr'?b.closest('[data-id]'):b.closest('article');let id='';if(site==='tumblr')id=a?.getAttribute('data-id')||'';else if(site==='x')id=(a?.querySelector('a[href*="/status/"]')?.getAttribute('href')||'').match(/status\\/(\\d+)/)?.[1]||'';else id=a?.getAttribute('data-post-id')||'';fixture.events.push([id,b.dataset.action]);if(b.dataset.action==='like'||b.dataset.action==='repost'||b.dataset.action==='reblog'){{const on=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',on?'false':'true')}}}},true);
      addEventListener('scroll',()=>{{if(fixture.suspendRestore||!fixture.removed.size)return;if(fixture.restoreDelayMs>0){{if(!fixture.restoreTimer)fixture.restoreTimer=setTimeout(()=>{{fixture.restoreTimer=0;fixture.restoreAll()}},fixture.restoreDelayMs)}}else fixture.restoreAll()}},{{passive:true}});
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
    p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}' && window.__UltraDeck.diagnostics().cachedPosts===32",timeout=20000)
    p.evaluate("window.__UltraDeck.setSettings({columns:8,proactiveBuffer:false});document.querySelector('#tu-ultrawide-deck-shell').scrollTop=260")
    p.wait_for_function("window.__UltraDeck.diagnostics().renderedColumns===8",timeout=10000)
    capsule=p.evaluate("window.__UltraDeck.postInfo('8')")
    assert capsule and capsule['interactionControls']>=5,(site,capsule)
    assert p.locator('#tu-ultrawide-deck-grid [data-tu-mirror-post="8"] [data-tu-control-key]').count()>=5
    selectors={
      'tumblr':{'like':'[data-testid=like]','reblog':'[data-testid=reblog]','reply':'[data-testid=reply]','share':'[data-testid=share]'},
      'x':{'like':'[data-testid=like]','repost':'[data-testid=retweet]','reply':'[data-testid=reply]','share':'[data-testid=share]'},
      'patreon':{'like':'[data-testid=like-button]','repost':'[data-testid=repost-button]','reply':'[data-testid=comment-button]','share':'[data-testid=share-button]'},
    }[site]
    before_scroll=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    results=[]
    for idx,(action,sel) in enumerate(selectors.items()):
        # Physically remove the real site post every time. Re-shape it while detached so saved native
        # element paths are stale; capsule signature rebinding must still find the exact control.
        p.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)")
        p.wait_for_timeout(60)
        p.evaluate("fixture.suspendRestore=true")
        assert p.evaluate("([id,reshape])=>fixture.remove(id,reshape)",['8',True]),(site,action)
        p.wait_for_timeout(120)
        p.wait_for_function("!window.__UltraDeck.sourceMounted('8')",timeout=5000)
        p.evaluate("fixture.suspendRestore=false")
        count=p.evaluate("([id,a])=>fixture.events.filter(x=>x[0]===id&&x[1]===a).length",['8',action])
        p.locator(f'#tu-ultrawide-deck-grid [data-tu-mirror-post="8"] {sel}').click(timeout=5000)
        p.wait_for_function("([id,a,n])=>fixture.events.filter(x=>x[0]===id&&x[1]===a).length===n",arg=['8',action,count+1],timeout=12000)
        results.append(action)
        p.wait_for_timeout(80)
    # X also proves the automatic second-chance path. The native post intentionally reappears
    # after the first bounded seek has expired; one UltraDeck intent must remain pending and replay
    # itself when the site source returns, without another click or visible deck movement.
    if site=='x':
        p.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)")
        p.wait_for_timeout(80)
        p.evaluate("fixture.suspendRestore=true;fixture.restoreDelayMs=3600")
        assert p.evaluate("fixture.remove('9',true)")
        p.wait_for_timeout(120)
        p.wait_for_function("!window.__UltraDeck.sourceMounted('9')",timeout=5000)
        p.evaluate("fixture.suspendRestore=false")
        count=p.evaluate("fixture.events.filter(x=>x[0]==='9'&&x[1]==='like').length")
        retry=p.evaluate("()=>window.__UltraDeck.interact('9','like')")
        assert retry.get('ok'),retry
        p.wait_for_function("n=>fixture.events.filter(x=>x[0]==='9'&&x[1]==='like').length===n",arg=count+1,timeout=12000)
        p.evaluate("fixture.restoreDelayMs=0")
    after_scroll=p.evaluate("document.querySelector('#tu-ultrawide-deck-shell').scrollTop")
    d=p.evaluate("window.__UltraDeck.diagnostics()")
    assert before_scroll==after_scroll,(site,before_scroll,after_scroll)
    assert d['interactionFailures']==0,(site,d)
    assert d.get('interactionCapsulePathHits',0)>=4,(site,d.get('interactionCapsulePathHits'))
    if site=='x':
        assert d.get('interactionAutoRetries',0)>=1 and d.get('interactionAutoRetrySuccesses',0)>=1,(site,d.get('interactionAutoRetries'),d.get('interactionAutoRetrySuccesses'))
    assert d['geometryViolations']==0,(site,d['geometryViolations'])
    assert not errors,(site,errors)
    out={'site':site,'actions':results,'interactionControls':capsule['interactionControls'],'capsulePathHits':d.get('interactionCapsulePathHits',0),'hoverPrewarms':d.get('interactionHoverPrewarms',0),'autoRetries':d.get('interactionAutoRetries',0),'autoRetrySuccesses':d.get('interactionAutoRetrySuccesses',0),'deckScrollDelta':after_scroll-before_scroll,'geometry':d['geometryViolations'],'failures':d['interactionFailures'],'errors':errors}
    p.close();return out

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
    browser=ensure_isolated_browser();runtime=browser_diagnostics();profile=tempfile.mkdtemp(prefix='ud-v83-capsule-profile-')
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--host-resolver-rules=MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1, MAP twitter.com 127.0.0.1']
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':2560,'height':1080},args=args)
        try:
            results=[run_site(ctx,port,'www.tumblr.com','/dashboard','tumblr'),run_site(ctx,port,'www.patreon.com','/home','patreon'),run_site(ctx,port,'x.com','/home','x')]
            out={'browser':runtime,'results':results};print(json.dumps(out,indent=2));assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
