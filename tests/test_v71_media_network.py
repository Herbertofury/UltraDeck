import threading,http.server,socketserver,subprocess,tempfile,time,pathlib,requests,websocket,json,io,sys
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
SCRIPT=(ROOT/'dist/Tumblr-UltraWide-Deck-v8.1.0.user.js').read_text()
IM={}
for w,h,c in [(48,30,(70,70,78)),(320,200,(65,115,185)),(640,400,(35,160,225)),(1280,800,(25,190,135))]:
 im=Image.new('RGB',(w,h),c);b=io.BytesIO();im.save(b,'PNG');IM[str(w)]=b.getvalue()
LOCK=threading.Lock();STARTS=[];COUNTS={}
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  p=self.path.split('?')[0];size=p.rsplit('/',1)[-1].split('.')[0];data=IM.get(size,IM['640'])
  with LOCK:COUNTS[p]=COUNTS.get(p,0)+1;STARTS.append((time.perf_counter(),p))
  if size!='48':time.sleep(.05)
  try:
   self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Cache-Control','public,max-age=3600,immutable');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
 def log_message(self,*a):pass
class C:
 def __init__(self,w):self.w=websocket.create_connection(w,timeout=30);self.i=0
 def call(self,m,p=None):
  self.i+=1;i=self.i;self.w.send(json.dumps({'id':i,'method':m,'params':p or {}}))
  while 1:
   x=json.loads(self.w.recv())
   if x.get('id')==i:
    if 'error'in x:raise RuntimeError(x['error'])
    return x.get('result',{})
 def ev(self,e):
  r=self.call('Runtime.evaluate',{'expression':e,'returnByValue':True,'awaitPromise':True})
  if 'exceptionDetails'in r:raise RuntimeError(r['exceptionDetails'])
  return r.get('result',{}).get('value')
 def wait(self,e,t=12):
  end=time.time()+t
  while time.time()<end:
   try:
    if self.ev(e):return
   except:pass
   time.sleep(.025)
  raise TimeoutError(e)
def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);port=srv.server_address[1];threading.Thread(target=srv.serve_forever,daemon=True).start()
 prof=tempfile.mkdtemp(prefix='ud71-media-');p=subprocess.Popen([str(ensure_isolated_browser()),'--headless=new','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','--window-size=3440,1400','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  f=pathlib.Path(prof)/'DevToolsActivePort'
  for _ in range(200):
   if f.exists():break
   time.sleep(.03)
  dp=int(f.read_text().splitlines()[0]);page=next(x for x in requests.get(f'http://127.0.0.1:{dp}/json').json() if x['type']=='page');c=C(page['webSocketDebuggerUrl']);c.call('Runtime.enable');c.call('Emulation.setDeviceMetricsOverride',{'width':3440,'height':1400,'deviceScaleFactor':1,'mobile':False})
  c.ev("document.open();document.write('<!doctype html><html><head><base href=\"https://www.tumblr.com/\"><style>html,body{margin:0;background:#111;color:#fff}article{background:#222}img{width:100%;height:auto}</style></head><body><nav><a href=\"/dashboard\">Home</a></nav><aside><h2>Radar</h2></aside><main data-timeline=\"x\"></main></body></html>');document.close();true")
  elements=[]
  for i in range(1,41): elements.append({'id':str(i),'content':[{'type':'image','media':[{'url':f'http://127.0.0.1:{port}/img/{i}/1280.png','type':'image/png','width':1280,'height':800},{'url':f'http://127.0.0.1:{port}/img/{i}/640.png','type':'image/png','width':640,'height':400},{'url':f'http://127.0.0.1:{port}/img/{i}/320.png','type':'image/png','width':320,'height':200}]}]})
  payload={'response':{'timeline':{'elements':elements}}}
  c.ev("window.tumblr={getCssMap:async()=>({}),on:()=>true,apiFetch:(r,i)=>Promise.resolve("+json.dumps(payload)+")};true")
  c.ev(SCRIPT); c.wait("window.__TumblrUltraWideDeck?.version==='8.5.0'",8)
  t0=time.perf_counter();c.ev("window.__p=window.tumblr.apiFetch('/api/v2/timeline/dashboard');true");time.sleep(.035);before_dom=c.ev("window.__TumblrUltraWideDeck.diagnostics()")
  dom=time.perf_counter();posts=''.join(f'<div tabindex="-1" data-id="{i}"><article><figure><img style="filter:blur(18px);opacity:.08" width="520" height="325" src="http://127.0.0.1:{port}/img/{i}/48.png"></figure><p>Post {i}</p><button>Like</button></article></div>' for i in range(1,41));c.ev("document.querySelector('main').innerHTML="+json.dumps(posts)+";true")
  c.wait("window.__TumblrUltraWideDeck.diagnostics().cachedPosts===40",10);c.ev("window.__TumblrUltraWideDeck.setSettings({columns:20})");c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===20",6);c.wait("window.__TumblrUltraWideDeck.diagnostics().mediaQualityReady>=40",12)
  d=c.ev("window.__TumblrUltraWideDeck.diagnostics()");blur=c.ev("[...document.querySelectorAll('#tu-ultrawide-deck-grid img')].filter(x=>/blur\\(/.test(getComputedStyle(x).filter)||Number(getComputedStyle(x).opacity)<.15).length")
  with LOCK:starts=list(STARTS);counts=dict(COUNTS)
  high=[t for t,path in starts if not path.endswith('/48.png')];duplicates={k:v for k,v in counts.items() if v>1}
  out={'beforeDom':{'apiStarts':before_dom['apiMediaStarts'],'preloadStarts':before_dom.get('mediaPreloadStarts',0)},'firstHighMs':round((min(high)-t0)*1000,1) if high else None,'highServerBeforeDom':sum(t<dom for t in high),'posts':d['cachedPosts'],'columns':d['renderedColumns'],'ready':d['mediaQualityReady'],'pending':d['mediaPending'],'blur':blur,'duplicates':duplicates,'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'preloadErrors':d.get('mediaPreloadErrors',0)}
  print(json.dumps(out,indent=2))
  assert out['beforeDom']['apiStarts']>=40 and out['highServerBeforeDom']>0,out
  assert out['posts']==40 and out['columns']==20 and out['ready']>=40 and out['pending']==0 and out['blur']==0,out
  assert not duplicates and out['geometry']==0 and out['interactions']==0 and out['preloadErrors']==0,out
 finally:
  p.terminate();srv.shutdown()
  try:p.wait(3)
  except:p.kill()
if __name__=='__main__':main()
