import json, pathlib, subprocess, tempfile, time, requests, websocket
PROJECT=pathlib.Path(__file__).resolve().parents[1]
ROOT=PROJECT/'dist-manual/chromium-mv3'
HTML=(ROOT/'popup.html').read_text(); CSS=(ROOT/'popup.css').read_text(); JS=(ROOT/'popup.js').read_text()
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
   if self.ev(e): return True
   time.sleep(.02)
  raise TimeoutError(e)
 def shot(self,path):
  import base64
  self.call('Emulation.setDeviceMetricsOverride',{'width':440,'height':820,'deviceScaleFactor':1,'mobile':False})
  d=self.call('Page.captureScreenshot',{'format':'png','fromSurface':True})['data'];pathlib.Path(path).write_bytes(base64.b64decode(d))
def main():
 prof=tempfile.mkdtemp(prefix='ud-popup-')
 import sys
 exe=json.loads(subprocess.check_output([sys.executable,str(PROJECT/'tests/policy_isolated_browser.py')],text=True))['path']
 p=subprocess.Popen([exe,'--headless=new','--no-sandbox','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  a=pathlib.Path(prof)/'DevToolsActivePort'
  for _ in range(200):
   if a.exists():break
   time.sleep(.03)
  port=int(a.read_text().splitlines()[0]);page=next(x for x in requests.get(f'http://127.0.0.1:{port}/json').json() if x['type']=='page');c=C(page['webSocketDebuggerUrl']);c.call('Runtime.enable');c.call('Page.enable')
  body=HTML.replace('<link rel="stylesheet" href="popup.css">','<style>'+CSS+'</style>').replace('<script src="popup.js"></script>','')
  c.ev("document.open();document.write("+json.dumps(body)+");document.close();true")
  c.ev("""globalThis.__messages=[];globalThis.__settings={columns:'auto',layoutMode:'masonry',mediaOnly:false,turboMedia:true,minCardWidth:320,minCardHeight:0,gap:16,leftOpen:true,rightOpen:true};globalThis.chrome={runtime:{},tabs:{query:async()=>[{id:42}],sendMessage:async(id,msg)=>{__messages.push(JSON.parse(JSON.stringify(msg)));if(msg.type==='setColumns')__settings.columns=msg.value;if(msg.type==='setSettings')Object.assign(__settings,msg.value||{});return {ok:true,payload:{version:'8.4.0',site:'tumblr',siteLabel:'Tumblr',settings:{...__settings},diagnostics:{cachedPosts:128,renderedColumns:Number(__settings.columns)||12,mediaQualityReady:118,mediaPreloadCompleted:118,interactionFailures:0,geometryViolations:0,layoutMode:__settings.layoutMode,minCardHeight:__settings.minCardHeight,mediaOnly:__settings.mediaOnly}}}}}};true""")
  c.ev(JS+';true');c.wait("document.getElementById('status').textContent==='Live · Tumblr'")
  # Every visible control in scope is exercised.
  c.ev("document.getElementById('columns').value='16';document.getElementById('columns').dispatchEvent(new Event('change',{bubbles:true}));true");time.sleep(.12)
  c.ev("document.getElementById('layout').value='rows';document.getElementById('layout').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('mediaOnly').click();document.getElementById('turbo').click();true");time.sleep(.15)
  for i,v in [('minWidth','280'),('minHeight','360'),('gap','9')]:
   c.ev(f"document.getElementById('{i}').value='{v}';document.getElementById('{i}').dispatchEvent(new Event('input',{{bubbles:true}}));true");time.sleep(.15)
  c.ev("document.getElementById('nav').click();document.getElementById('focus').click();document.getElementById('extras').click();document.getElementById('sync').click();document.getElementById('rebalance').click();document.getElementById('rescan').click();true");time.sleep(.25)
  out=c.ev("({status:document.getElementById('status').textContent,version:document.getElementById('version').textContent,posts:document.getElementById('posts').textContent,media:document.getElementById('media').textContent,minHeightOut:document.getElementById('minHeightOut').textContent,messages:__messages,types:__messages.map(x=>x.type)})")
  print(json.dumps(out,indent=2))
  assert out['status']=='Live · Tumblr' and out['version']=='v8.4.0' and out['posts']=='128' and out['media']=='118' and out['minHeightOut']=='360px'
  assert any(x['type']=='setColumns' and x.get('value')==16 for x in out['messages'])
  wanted=[{'layoutMode':'rows'},{'mediaOnly':True},{'turboMedia':False},{'minCardWidth':280},{'minCardHeight':360},{'gap':9}]
  for patch in wanted: assert any(x['type']=='setSettings' and all(x.get('value',{}).get(k)==v for k,v in patch.items()) for x in out['messages']),patch
  for typ in ['getState','toggleNav','toggleFocus','toggleExtras','syncMedia','rebalance','rescan']: assert typ in out['types'],typ
  c.shot(str(PROJECT/'dist/UltraDeck-Extension-v8.4.0-popup.png'))
 finally:
  p.terminate();p.wait(timeout=5)
if __name__=='__main__':main()
