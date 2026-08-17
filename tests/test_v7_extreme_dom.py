import subprocess,tempfile,time,json,requests,websocket,pathlib,sys,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.5.0')
SCRIPT=pathlib.Path(os.environ.get('ULTRADECK_USERSCRIPT_PATH',str(ROOT/f'dist/Tumblr-UltraWide-Deck-v{VERSION}.user.js'))).read_text()
BASE=(ROOT/'tests/fixtures/tumblr_fixture.html').read_text()
HTML=BASE.replace('<head>', '<head><base href="https://www.tumblr.com/"><style>.hardwide{width:540px!important;min-width:540px!important;max-width:none!important}.hostile-fixed{position:fixed;left:42vw;top:22vh;width:540px;z-index:999999}</style>')
HTML=HTML.replace('<div class="postbody"><p data-testid="body">Post ${id} body text. Click, expand, select, use controls.</p>', '''<div class="postbody"><div class="hardwide"><p data-testid="body">Post ${id} body text. Click, expand, select, use controls. ${id % 3 === 0 ? 'LONG CONTENT '.repeat(85) : ''}</p></div>${id % 7 === 0 ? '<div class="hostile-fixed" style="position:fixed;left:42vw;top:22vh;width:540px">HOSTILE FIXED '+id+'</div>' : ''}''')
HTML=HTML.replace('<img src="/img/${id}.svg" width="520" height="300" alt="fixture image ${id}">', '''<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='520' height='300'%3E%3Crect width='520' height='300' fill='%23345'/%3E%3C/svg%3E" width="520" height="300" style="height:${140+(id*91)%760}px;object-fit:cover" alt="fixture image ${id}">''')

class CDP:
    def __init__(self,wsurl): self.ws=websocket.create_connection(wsurl,timeout=10); self.i=0
    def call(self,method,params=None):
        self.i+=1; ident=self.i; self.ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(self.ws.recv())
            if msg.get('id')==ident:
                if 'error' in msg: raise RuntimeError(msg['error'])
                return msg.get('result',{})
    def eval(self,expr,awaitPromise=True):
        r=self.call('Runtime.evaluate',{'expression':expr,'awaitPromise':awaitPromise,'returnByValue':True})
        if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
        return r.get('result',{}).get('value')
    def wait(self,expr,timeout=12,interval=.05):
        t=time.time(); last=None
        while time.time()-t<timeout:
            try:
                last=self.eval(expr)
                if last:return last
            except Exception: pass
            time.sleep(interval)
        raise TimeoutError(f'wait failed {expr}; last={last}')

def overlap_expr():
    return r'''(()=>{let bad=[];for(const col of document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-column')){const a=[...col.querySelectorAll(':scope>.tu-item')].map(e=>({e,r:e.getBoundingClientRect()}));a.sort((x,y)=>x.r.top-y.r.top);for(let i=1;i<a.length;i++){const p=a[i-1],c=a[i];if(p.r.bottom>c.r.top-1)bad.push([p.e.dataset.tuItem,c.e.dataset.tuItem,Math.round(p.r.bottom-c.r.top)])}}return bad})()'''

def overflow_expr():
    return r'''(()=>{const bad=[];for(const item of document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item')){const ir=item.getBoundingClientRect(),m=item.querySelector('[data-tu-mirror-post]');if(!m)continue;for(const el of m.querySelectorAll('*')){const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden')continue;const r=el.getBoundingClientRect();if(r.width>3&&(r.left<ir.left-3||r.right>ir.right+3)){bad.push([item.dataset.tuItem,el.tagName,Math.round(r.left-ir.left),Math.round(r.right-ir.right),s.position]);break}}}return bad})()'''

def main():
    profile=tempfile.mkdtemp(prefix='ud5-dom-')
    chrome=subprocess.Popen([str(ensure_isolated_browser()),'--headless=new','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={profile}','--window-size=3440,1200','about:blank'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        active=pathlib.Path(profile)/'DevToolsActivePort'
        for _ in range(160):
            if active.exists(): break
            time.sleep(.05)
        port=int(active.read_text().splitlines()[0]); page=next(t for t in requests.get(f'http://127.0.0.1:{port}/json').json() if t['type']=='page')
        c=CDP(page['webSocketDebuggerUrl']); c.call('Runtime.enable'); c.call('Page.enable')
        c.eval(f"document.open();document.write({json.dumps(HTML)});document.close();true")
        c.wait("document.readyState==='complete'&&!!window.fixture&&document.querySelectorAll('[tabindex=\"-1\"][data-id]').length===8",5)
        c.eval("window.tumblr={getCssMap:()=>Promise.resolve({cell:['fixtureCell'],imageBlockButton:['hardwide'],rows:['postbody'],row:['postbody']})}")
        c.eval(SCRIPT)
        c.wait("!!window.__TumblrUltraWideDeck",6)
        c.wait("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length>=8",6)
        # Stress 20 columns and large retained feed.
        c.eval("window.__TumblrUltraWideDeck.setColumns(20)")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===20",6)
        c.eval("window.__TumblrUltraWideDeck.buffer(190)")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=176",35,.06)
        time.sleep(.8); c.eval("window.__TumblrUltraWideDeck.audit()"); time.sleep(.25)
        bad= c.eval(overlap_expr()); assert not bad, bad[:10]
        overflow=c.eval(overflow_expr()); assert not overflow, overflow[:10]
        # No hover or pointer-down may expose an entire native post over the deck.
        c.eval("(()=>{const b=document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post] [data-testid=like]');b.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));return true})()")
        time.sleep(.15)
        assert c.eval("document.querySelectorAll('[data-tu-live-source=\"1\"]').length") == 0
        # Click must still execute native React-style handler exactly once and the real control is only invisibly staged.
        before=c.eval("window.fixture.events.filter(e=>e[0]==='like').length")
        c.eval("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post] [data-testid=like]').click()")
        c.wait(f"window.fixture.events.filter(e=>e[0]==='like').length==={before+1}",5)
        assert c.eval("document.querySelectorAll('[data-tu-live-source=\"1\"]').length") == 0
        stage=c.eval(r'''(()=>{const a=document.querySelector('[data-tu-action-anchor="1"]');if(!a)return null;const m=document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post] [data-testid=like]');const x=a.getBoundingClientRect(),y=m.getBoundingClientRect();return {opacity:getComputedStyle(a).opacity,dx:Math.abs((x.left+x.width/2)-(y.left+y.width/2)),dy:Math.abs((x.top+x.height/2)-(y.top+y.height/2))}})()''')
        assert stage and stage['opacity']=='0' and stage['dx']<6 and stage['dy']<2, stage
        # Editable clone remains visible while state is mirrored into native source.
        inp="#tu-ultrawide-deck-grid [data-tu-mirror-post] [data-testid=comment-input]"
        c.eval(f"(()=>{{const i=document.querySelector('{inp}');i.value='hello-v7';i.dispatchEvent(new InputEvent('input',{{bubbles:true,inputType:'insertText',data:'hello-v7'}}));return true}})()")
        c.wait("window.fixture.events.some(e=>e[0]==='input'&&e[2]==='hello-v7')",5)
        # Rails remain independent.
        c.eval("window.__TumblrUltraWideDeck.toggleNav()")
        c.wait("getComputedStyle(document.querySelector('nav')).display==='none'",3)
        assert c.eval("getComputedStyle(document.querySelector('aside[aria-label=Sidebar]')).display!=='none'")
        c.eval("window.__TumblrUltraWideDeck.toggleExtras()")
        c.wait("getComputedStyle(document.querySelector('aside[aria-label=Sidebar]')).display==='none'",3)
        c.eval("window.__TumblrUltraWideDeck.toggleNav();window.__TumblrUltraWideDeck.toggleExtras()")
        c.wait("getComputedStyle(document.querySelector('nav')).display!=='none'&&getComputedStyle(document.querySelector('aside[aria-label=Sidebar]')).display!=='none'",3)
        # Column transitions remain overlap-proof and should be dramatically cheaper without grid-span writes.
        transitions=[]
        for n in [6,12,20,8,16,20]:
            t=time.perf_counter(); c.eval(f"window.__TumblrUltraWideDeck.setColumns({n})"); c.wait(f"window.__TumblrUltraWideDeck.diagnostics().renderedColumns==={n}",6); time.sleep(.08)
            ob=c.eval(overlap_expr()); assert not ob,(n,ob[:8]); transitions.append({'columns':n,'ms':round((time.perf_counter()-t)*1000,1)})
        # Hard scroll and buffer again.
        for _ in range(16):
            c.eval("document.querySelector('#tu-ultrawide-deck-shell').scrollTop=document.querySelector('#tu-ultrawide-deck-shell').scrollHeight")
            time.sleep(.035)
        c.eval("window.__TumblrUltraWideDeck.buffer(200)")
        time.sleep(.5)
        diag=c.eval("window.__TumblrUltraWideDeck.diagnostics()")
        bad2=c.eval(overlap_expr()); overflow2=c.eval(overflow_expr())
        result={'diag':diag,'stage':stage,'transitions':transitions,'overlaps':bad2,'overflow':overflow2,'events':c.eval('window.fixture.events.slice(-25)')}
        print(json.dumps(result,indent=2))
        assert diag['version']==VERSION
        assert diag['layoutMode']=='masonry'
        assert diag['renderedColumns']==20 and diag['requestedColumns']==20
        assert diag['deckScrollable']
        assert diag['spanWrites']==0
        assert diag['nativeActions']>=1 and diag['nativeInputSyncs']>=1
        assert not bad2 and not overflow2
    finally:
        try: chrome.terminate(); chrome.wait(timeout=5)
        except: chrome.kill()
if __name__=='__main__': main()
