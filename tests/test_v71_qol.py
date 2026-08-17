import subprocess, tempfile, time, json, requests, websocket, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
SCRIPT = (ROOT/'dist/Tumblr-UltraWide-Deck-v8.1.0.user.js').read_text()
HTML = r'''<!doctype html><html><head><base href="https://www.tumblr.com/"><style>
html,body{margin:0;background:#0b0b0c;color:#eee;font:14px Arial;min-height:3600px;overflow-x:hidden}
#tabs{position:fixed;top:38px;left:50%;transform:translateX(-50%);width:540px;height:44px;display:flex;align-items:center;justify-content:space-around;border-bottom:1px solid #333;background:#0b0b0c;z-index:5}
#tabs a{color:#bbb;text-decoration:none;font-weight:700}#tabs a:first-child{color:#fff;border-bottom:2px solid #00b8ff;height:42px;display:flex;align-items:center}
nav.side{position:fixed;left:16px;top:92px;width:210px} nav.side a{display:block;color:#aaa;padding:7px}
aside{position:fixed;right:16px;top:92px;width:280px}.radar{height:260px;background:#18181b}
#ghosts{position:fixed;top:142px;left:50%;transform:translateX(-50%);width:50px;text-align:center;z-index:1}#ghosts div{font-size:30px;height:60px}
#utility{display:none;position:fixed;top:94px;left:50%;transform:translateX(-50%);width:540px;height:92px;background:#19191d;border:1px solid #333;border-radius:12px;z-index:6;padding:8px;box-sizing:border-box}
#utility.show{display:block}#utility button{margin:5px;padding:8px 12px}
main{position:absolute;top:228px;left:50%;width:540px;transform:translateX(-50%)}
article{background:#17171b;border:1px solid #333;border-radius:12px;margin-bottom:16px;overflow:hidden;padding:10px;box-sizing:border-box}.hero{display:block;width:100%;height:auto}.txt{font-size:14px;line-height:1.4}
</style></head><body>
<div id="tabs" role="tablist"><a href="/dashboard/following">Following</a><a href="/dashboard/stuff_for_you">For you</a><a href="/dashboard/hubs">Your tags</a><a href="/dashboard/missed_posts">What you missed</a></div>
<nav class="side" role="navigation"><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav>
<aside role="complementary"><h2>Check out these blogs</h2><a>Explore all of Tumblr</a><h2>Radar</h2><div class="radar"></div></aside>
<div id="ghosts"><div>👽</div><div>👽</div></div>
<div id="utility"><button>Filter by tag</button><button>Manage</button><button>Text</button><button>Photo</button><button>Quote</button><button>Link</button><button>Chat</button></div>
<main data-timeline="/v2/timeline/dashboard" data-timeline-id="/dashboard/following"></main>
<script>
window.makePost=id=>{const e=document.createElement('div');e.tabIndex=-1;e.dataset.id=String(id);const textOnly=id%11===0;const h=160+(id%5)*55;const img=textOnly?'':`<img class="hero" alt="hero ${id}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='${h}'%3E%3Crect width='600' height='${h}' fill='%23${['345','456','567','678','789'][id%5]}'/%3E%3C/svg%3E">`;e.innerHTML=`<article><header><b>User ${id}</b><span> · 2h</span></header><p class="txt">Post ${id} ${'description text '.repeat((id%4)+3)}</p>${img}<blockquote>Caption ${id} ${'more text '.repeat(2)}</blockquote><footer><button>Like</button><button>Reblog</button></footer></article>`;return e};
const m=document.querySelector('main');m.append(...Array.from({length:36},(_,i)=>makePost(1000+i)));
window.setUtility=(on)=>{document.querySelector('#utility').classList.toggle('show',on);m.dataset.timelineId=on?'/dashboard/hubs-'+Date.now():'/dashboard/following-'+Date.now()};
</script></body></html>'''
class C:
    def __init__(self,w): self.w=websocket.create_connection(w,timeout=10); self.i=0
    def call(self,m,p=None):
        self.i+=1; i=self.i; self.w.send(json.dumps({'id':i,'method':m,'params':p or {}}))
        while True:
            x=json.loads(self.w.recv())
            if x.get('id')==i:return x.get('result',{})
    def ev(self,e): return self.call('Runtime.evaluate',{'expression':e,'awaitPromise':True,'returnByValue':True}).get('result',{}).get('value')
    def wait(self,e,t=10):
        st=time.time()
        while time.time()-st<t:
            try:
                if self.ev(e): return True
            except Exception: pass
            time.sleep(.05)
        raise TimeoutError(e)

def main():
    prof=tempfile.mkdtemp(prefix='ud71-qol-')
    p=subprocess.Popen([str(ensure_isolated_browser()),'--headless=new','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','--window-size=2048,1100','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        a=pathlib.Path(prof)/'DevToolsActivePort'
        for _ in range(200):
            if a.exists(): break
            time.sleep(.05)
        port=int(a.read_text().splitlines()[0]); t=next(x for x in requests.get(f'http://127.0.0.1:{port}/json').json() if x['type']=='page'); c=C(t['webSocketDebuggerUrl']); c.call('Runtime.enable')
        c.ev(f'document.open();document.write({json.dumps(HTML)});document.close();true'); c.wait('!!window.setUtility'); c.ev(SCRIPT)
        c.wait("window.__TumblrUltraWideDeck?.diagnostics().cachedPosts>=24",12)
        c.ev("window.__TumblrUltraWideDeck.setSettings({columns:6,layoutMode:'rows',minCardHeight:360,mediaOnly:true,gap:10})")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===6 && window.__TumblrUltraWideDeck.diagnostics().layoutMode==='rows'",8)
        d1=c.ev('window.__TumblrUltraWideDeck.diagnostics()')
        shell_top=c.ev("document.querySelector('#tu-ultrawide-deck-shell').getBoundingClientRect().top")
        first_top=c.ev("document.querySelector('#tu-ultrawide-deck-grid>.tu-item').getBoundingClientRect().top")
        assert 82 <= d1['deckTop'] <= 102, d1
        assert abs(shell_top-d1['deckTop']) < 2, (shell_top,d1)
        assert abs(first_top-shell_top) < 3, (first_top,shell_top)
        assert d1['minCardHeight']==360 and d1['mediaOnly'] is True
        xs=c.ev("[...new Set([...document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-item')].slice(0,18).map(x=>Math.round(x.getBoundingClientRect().left)))].length")
        assert xs==6, xs
        rects=c.ev("[...document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-item')].slice(0,12).map(x=>({t:x.getBoundingClientRect().top,h:x.getBoundingClientRect().height}))")
        assert all(r['h'] >= 359 for r in rects), rects
        assert max(r['t'] for r in rects[:6])-min(r['t'] for r in rects[:6]) < 1.5, rects[:6]
        assert max(r['t'] for r in rects[6:12])-min(r['t'] for r in rects[6:12]) < 1.5, rects[6:12]
        hidden=c.ev("[...document.querySelectorAll('#tu-ultrawide-deck-grid [data-tu-text-only=\"1\"]')].filter(x=>getComputedStyle(x).display==='none').length")
        assert hidden>0, hidden
        # Text-only posts stay readable even in images-first mode.
        text_only_visible=c.ev("(()=>{const item=[...document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-item')].find(x=>!x.querySelector('img.hero'));const p=item?.querySelector('.txt');return !!p && getComputedStyle(p).display!=='none';})()")
        assert text_only_visible, 'text-only post was collapsed'
        # Per-card text reveal works without turning the global mode off.
        peek_result=c.ev("(()=>{const b=document.querySelector('#tu-ultrawide-deck-grid>.tu-item[data-tu-has-hidden-text=\"1\"]>.tu-text-peek'); if(!b)return null; b.click(); const item=b.parentElement; const txt=item.querySelector('[data-tu-text-only=\"1\"]'); return {show:item.dataset.tuShowText,display:getComputedStyle(txt).display,label:b.textContent};})()")
        assert peek_result and peek_result['show']=='1' and peek_result['display']!='none', peek_result
        # Switch back to shortest-column masonry without losing any retained cards.
        before=d1['cachedPosts']
        c.ev("window.__TumblrUltraWideDeck.setSettings({layoutMode:'masonry',mediaOnly:false,minCardHeight:0})")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().layoutMode==='masonry' && window.__TumblrUltraWideDeck.diagnostics().renderedColumns===6",8)
        d2=c.ev('window.__TumblrUltraWideDeck.diagnostics()')
        assert d2['cachedPosts']==before and d2['minCardHeight']==0 and d2['mediaOnly'] is False
        assert c.ev("document.querySelector('#tu-ultrawide-deck-grid').children.length>0") is True
        assert c.ev("document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-column').length") == 6
        # Your Tags toolbar is reserved, then the gap is released when leaving it.
        c.ev("setUtility(true);history.pushState({},'', '/dashboard/hubs');true")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().topAnchorSource==='route-controls'",8)
        d3=c.ev('window.__TumblrUltraWideDeck.diagnostics()')
        assert 180 <= d3['deckTop'] <= 210, d3
        c.ev("setUtility(false);history.pushState({},'', '/dashboard/following');true")
        c.wait("window.__TumblrUltraWideDeck.diagnostics().topAnchorSource==='chrome'",8)
        d4=c.ev('window.__TumblrUltraWideDeck.diagnostics()')
        assert 82 <= d4['deckTop'] <= 102, d4
        # Independent rails survive the route swaps.
        c.ev('window.__TumblrUltraWideDeck.toggleNav()'); time.sleep(.2)
        nav_hidden=c.ev("getComputedStyle(document.querySelector('nav.side')).display==='none'")
        extra_visible=c.ev("getComputedStyle(document.querySelector('aside')).display!=='none'")
        c.ev('window.__TumblrUltraWideDeck.toggleExtras()'); time.sleep(.2)
        both_hidden=c.ev("getComputedStyle(document.querySelector('nav.side')).display==='none' && getComputedStyle(document.querySelector('aside')).display==='none'")
        assert nav_hidden and extra_visible and both_hidden
        out={'rows':{'deckTop':d1['deckTop'],'columns':d1['renderedColumns'],'minHeight':d1['minCardHeight'],'hiddenText':hidden,'peek':peek_result},'masonry':{'columns':d2['renderedColumns'],'posts':d2['cachedPosts']},'tags':{'deckTop':d3['deckTop'],'source':d3['topAnchorSource']},'following':{'deckTop':d4['deckTop'],'source':d4['topAnchorSource']},'rails':{'navHidden':nav_hidden,'extrasStayedVisible':extra_visible,'bothHidden':both_hidden}}
        print(json.dumps(out,indent=2))
    finally:
        p.terminate()
        try:p.wait(3)
        except: p.kill()
if __name__=='__main__': main()
