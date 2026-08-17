import subprocess,tempfile,pathlib,time,requests,websocket,json,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
SCRIPT=(ROOT/'dist/Tumblr-UltraWide-Deck-v8.1.0.user.js').read_text()
class C:
 def __init__(self,w):self.w=websocket.create_connection(w,timeout=20);self.i=0
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
   if self.ev(e):return
   time.sleep(.02)
  raise TimeoutError(e)
def main():
 prof=tempfile.mkdtemp(prefix='ud-cmd-');p=subprocess.Popen([str(ensure_isolated_browser()),'--headless=new','--no-sandbox','--remote-allow-origins=*','--remote-debugging-port=0',f'--user-data-dir={prof}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  a=pathlib.Path(prof)/'DevToolsActivePort'
  for _ in range(200):
   if a.exists():break
   time.sleep(.03)
  port=int(a.read_text().splitlines()[0]);page=next(x for x in requests.get(f'http://127.0.0.1:{port}/json').json() if x['type']=='page');c=C(page['webSocketDebuggerUrl']);c.call('Runtime.enable')
  posts=''.join(f'<div tabindex="-1" data-id="{i}"><article><p>Post {i}</p><button data-testid="like">Like</button></article></div>' for i in range(1,41))
  html=f'<!doctype html><html><head><base href="https://www.tumblr.com/"></head><body><nav role="navigation"><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/communities">Communities</a><a href="/activity">Activity</a><a href="/messaging">Messages</a><a href="/inbox">Inbox</a><a href="/account">Account</a><a href="/settings">Settings</a></nav><main data-timeline="/v2/timeline/dashboard">{posts}</main><aside role="complementary"><h2>Radar</h2></aside></body></html>'
  c.ev("document.open();document.write("+json.dumps(html)+");document.close();true")
  c.ev(SCRIPT+';true');c.wait("window.__TumblrUltraWideDeck?.version==='8.4.0'")
  def send(typ,val=None,req='x'):
   payload={'type':typ,'requestId':req}
   if val is not None: payload['value']=val
   c.ev("document.dispatchEvent(new CustomEvent('ultradeck:command',{detail:"+json.dumps(json.dumps(payload))+"}));true")
   time.sleep(.08)
  send('setColumns',12,'c');c.wait("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===12")
  send('toggleNav',None,'n');time.sleep(.12);nav=c.ev("getComputedStyle(document.querySelector('nav')).display==='none'")
  extra_before=c.ev("getComputedStyle(document.querySelector('aside')).display!=='none'")
  send('toggleExtras',None,'e');time.sleep(.12);extras=c.ev("getComputedStyle(document.querySelector('aside')).display==='none'")
  nav_still=c.ev("getComputedStyle(document.querySelector('nav')).display==='none'")
  send('setSettings',{'minCardWidth':260,'minCardHeight':280,'gap':9,'layoutMode':'rows','mediaOnly':True,'turboMedia':True},'s')
  d=c.ev("window.__TumblrUltraWideDeck.diagnostics()")
  out={'columns':d['renderedColumns'],'navHidden':nav,'extrasWasOpen':extra_before,'extrasHidden':extras,'navStillHidden':nav_still,'minCardWidth':d['settings']['minCardWidth'],'minCardHeight':d['settings']['minCardHeight'],'gap':d['settings']['gap'],'layoutMode':d['settings']['layoutMode'],'mediaOnly':d['settings']['mediaOnly'],'interactionFailures':d['interactionFailures'],'geometryViolations':d['geometryViolations']}
  print(json.dumps(out,indent=2))
  assert out=={'columns':12,'navHidden':True,'extrasWasOpen':True,'extrasHidden':True,'navStillHidden':True,'minCardWidth':260,'minCardHeight':280,'gap':9,'layoutMode':'rows','mediaOnly':True,'interactionFailures':0,'geometryViolations':0}
 finally:
  p.terminate();p.wait(timeout=5)
if __name__=='__main__':main()
