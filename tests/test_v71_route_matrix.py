import subprocess,tempfile,time,pathlib,requests,websocket,json,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
SCRIPT=(ROOT/'dist/Tumblr-UltraWide-Deck-v8.1.0.user.js').read_text()
HTML='''<!doctype html><html><head><base href="https://www.tumblr.com/"><style>html,body{margin:0;background:#09090a;color:white;min-height:4000px}#tabs{position:fixed;top:28px;left:50%;transform:translateX(-50%);height:52px;width:600px;border-bottom:1px solid #333;z-index:5}#util{display:none;position:fixed;top:84px;left:50%;transform:translateX(-50%);width:600px;height:88px;background:#15151a;z-index:5}#util.show{display:block}nav{position:fixed;left:12px;top:90px}aside{position:fixed;right:12px;top:90px;width:260px}main{position:absolute;top:220px;left:50%;transform:translateX(-50%);width:540px}article{background:#1a1a1e;border:1px solid #333;margin:0 0 12px;border-radius:10px;overflow:hidden}img{display:block;width:100%;height:auto}</style></head><body><div id="tabs">Following　 For you　 Your tags　 What you missed</div><div id="util"><button>Filter by tag</button><button>Manage</button><button>Text</button><button>Photo</button><button>Quote</button><button>Link</button></div><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a></nav><aside><h2>Check out these blogs</h2><h2>Radar</h2></aside><main data-timeline="x"></main><script>window.make=(id)=>{const e=document.createElement('div');e.tabIndex=-1;e.dataset.id=id;e.innerHTML=`<article><p>Post ${id}</p><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='260'%3E%3Crect width='600' height='260' fill='%23345'/%3E%3C/svg%3E"><button>Like</button></article>`;return e};window.route=(path,n=30)=>{const m=document.querySelector('main');m.innerHTML='';for(let i=0;i<n;i++)m.append(make(path.replace(/\\W/g,'')+'-'+i));document.querySelector('#util').classList.toggle('show',path.includes('/dashboard/hubs'));history.pushState({},'',path);return true};route('/dashboard/following');</script></body></html>'''
class C:
 def __init__(self,w):self.w=websocket.create_connection(w,timeout=20);self.i=0
 def call(self,m,p=None):
  self.i+=1;i=self.i;self.w.send(json.dumps({'id':i,'method':m,'params':p or {}}))
  while 1:
   x=json.loads(self.w.recv())
   if x.get('id')==i:return x.get('result',{})
 def ev(self,e):return self.call('Runtime.evaluate',{'expression':e,'returnByValue':True,'awaitPromise':True}).get('result',{}).get('value')
 def wait(self,e,t=8):
  end=time.time()+t
  while time.time()<end:
   try:
    if self.ev(e):return
   except:pass
   time.sleep(.03)
  raise TimeoutError(e)
def main():
 prof=tempfile.mkdtemp(prefix='ud71-routes-');p=subprocess.Popen([str(ensure_isolated_browser()),'--headless=new','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','--window-size=2560,1200','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  f=pathlib.Path(prof)/'DevToolsActivePort'
  for _ in range(200):
   if f.exists():break
   time.sleep(.03)
  dp=int(f.read_text().splitlines()[0]);targets=[]
  for _ in range(100):
   targets=[x for x in requests.get(f'http://127.0.0.1:{dp}/json').json() if x['type']=='page']
   if targets:break
   time.sleep(.03)
  c=C(targets[0]['webSocketDebuggerUrl']);c.call('Runtime.enable');c.ev('document.open();document.write('+json.dumps(HTML)+');document.close();true');c.wait('!!window.route');c.ev(SCRIPT);c.wait("window.__TumblrUltraWideDeck?.version==='8.4.0'");c.ev("window.__TumblrUltraWideDeck.setSettings({columns:8,layoutMode:'masonry',gap:10})")
  routes=['/dashboard/following','/dashboard/stuff_for_you','/dashboard/hubs','/explore/trending','/tagged/sims-4-download','/search/sims%204%20download']
  out=[]
  for path in routes:
   c.ev('route('+json.dumps(path)+',30)');c.wait("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=24",8);c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===8",8);time.sleep(.08)
   d=c.ev("window.__TumblrUltraWideDeck.diagnostics()");first=c.ev("document.querySelector('#tu-ultrawide-deck-grid .tu-item')?.getBoundingClientRect().top||0");shell=c.ev("document.querySelector('#tu-ultrawide-deck-shell')?.getBoundingClientRect().top||0");out.append({'route':path,'posts':d['cachedPosts'],'columns':d['renderedColumns'],'top':d['deckTop'],'source':d['topAnchorSource'],'delta':round(first-shell,2),'scrollable':d['deckScrollable'],'geometry':d['geometryViolations'],'interactionFailures':d['interactionFailures']})
   assert d['cachedPosts']>=24 and d['renderedColumns']==8 and d['geometryViolations']==0 and d['interactionFailures']==0
   assert abs(first-shell)<3,(path,first,shell,d)
   if path=='/dashboard/hubs': assert d['topAnchorSource']=='route-controls' and 170<=d['deckTop']<=210,d
   else: assert d['deckTop']<=110,d
  print(json.dumps(out,indent=2))
 finally:
  p.terminate();
  try:p.wait(3)
  except:p.kill()
if __name__=='__main__':main()
