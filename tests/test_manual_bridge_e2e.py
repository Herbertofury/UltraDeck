import subprocess,tempfile,pathlib,time,requests,websocket,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
SITE=(ROOT/'dist-manual/chromium-mv3/site-tumblr.js').read_text()
RUNTIME=(ROOT/'dist-manual/chromium-mv3/runtime-main.js').read_text()
BRIDGE=(ROOT/'dist-manual/chromium-mv3/bridge.js').read_text()
class C:
 def __init__(self,w): self.w=websocket.create_connection(w,timeout=20); self.i=0
 def call(self,m,p=None):
  self.i+=1;i=self.i;self.w.send(json.dumps({'id':i,'method':m,'params':p or {}}))
  while 1:
   x=json.loads(self.w.recv())
   if x.get('id')==i:return x.get('result',{})
 def ev(self,e):
  r=self.call('Runtime.evaluate',{'expression':e,'returnByValue':True,'awaitPromise':True});return r.get('result',{}).get('value')
 def wait(self,e,t=8):
  end=time.time()+t
  while time.time()<end:
   if self.ev(e):return True
   time.sleep(.02)
  raise TimeoutError(e)
def main():
 browser=str((ROOT/'tests/policy_isolated_browser.py').resolve()); import sys
 prof=tempfile.mkdtemp(prefix='ud-bridge-e2e-'); exe=json.loads(subprocess.check_output([sys.executable,browser],text=True))['path'];p=subprocess.Popen([exe,'--headless=new','--no-sandbox','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  a=pathlib.Path(prof)/'DevToolsActivePort'
  for _ in range(200):
   if a.exists():break
   time.sleep(.03)
  port=int(a.read_text().splitlines()[0]);page=next(x for x in requests.get(f'http://127.0.0.1:{port}/json').json() if x['type']=='page');c=C(page['webSocketDebuggerUrl']);c.call('Runtime.enable')
  posts=''.join(f'<div tabindex="-1" data-id="{i}"><article><p>Post {i}</p><button data-testid="like">Like</button></article></div>' for i in range(1,49))
  nav=''.join(f'<a href="{p}">{n}</a>' for p,n in [('/dashboard','Home'),('/explore','Explore'),('/communities','Communities'),('/activity','Activity'),('/messaging','Messages'),('/inbox','Inbox'),('/account','Account'),('/settings','Settings')])
  html=f'<!doctype html><html><head><base href="https://www.tumblr.com/"></head><body><nav role="navigation">{nav}</nav><main data-timeline="/v2/timeline/dashboard">{posts}</main><aside role="complementary"><h2>Radar</h2></aside></body></html>'
  c.ev('document.open();document.write('+json.dumps(html)+');document.close();true')
  # Mock exactly the extension APIs bridge.js consumes.
  c.ev("globalThis.__listener=null;globalThis.__stored={};globalThis.chrome={storage:{local:{get:async(k)=>({}),set:async(v)=>{Object.assign(__stored,v);}}},runtime:{onMessage:{addListener:(fn)=>{__listener=fn;}}}};true")
  c.ev(SITE+';true');c.ev(RUNTIME+';true');c.wait("window.__TumblrUltraWideDeck?.version==='8.4.0'")
  c.ev(BRIDGE+';true');c.wait("typeof __listener==='function'")
  async_expr="""(async()=>{function send(m){return new Promise(resolve=>{const ret=__listener(m,{},resolve);if(ret!==true)resolve({ok:false,error:'listener did not keep channel open'})})}const a=await send({type:'setColumns',value:14});const b=await send({type:'toggleNav'});const c=await send({type:'toggleExtras'});const d=await send({type:'setSettings',value:{minCardWidth:270,minCardHeight:300,gap:10,layoutMode:'rows',mediaOnly:true,turboMedia:true}});return {a,b,c,d,diag:window.__TumblrUltraWideDeck.diagnostics(),navHidden:getComputedStyle(document.querySelector('nav')).display==='none',extraHidden:getComputedStyle(document.querySelector('aside')).display==='none',stored:__stored};})()"""
  out=c.ev(async_expr)
  c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===14",5)
  out['diag']=c.ev("window.__TumblrUltraWideDeck.diagnostics()")
  print(json.dumps(out,indent=2))
  assert out['a']['ok'] and out['b']['ok'] and out['c']['ok'] and out['d']['ok']
  assert out['diag']['renderedColumns']==14 and out['diag']['settings']['minCardWidth']==270 and out['diag']['settings']['gap']==10 and out['diag']['settings']['minCardHeight']==300 and out['diag']['settings']['layoutMode']=='rows' and out['diag']['settings']['mediaOnly'] is True
  assert out['navHidden'] and out['extraHidden']
  assert 'ultradeckSettings' in out['stored']
  assert out['diag']['interactionFailures']==0 and out['diag']['geometryViolations']==0
 finally:
  p.terminate();p.wait(timeout=5)
if __name__=='__main__':main()
