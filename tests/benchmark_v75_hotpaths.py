from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve(); CAND=pathlib.Path(sys.argv[2]).resolve()
SEQ=[6,12,20,8,16,20]; CYCLES=int(os.environ.get('ULTRADECK_CYCLES','8'))
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{170+(i*67)%520}px"></div><p>Post {i} {"text "*30 if i%4==0 else ""}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-hot75-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  try:
   self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
  except (BrokenPipeError,ConnectionResetError): pass
 def log_message(self,*a):pass

def stats(vals):
 vals=sorted(vals);return {'mean':round(statistics.mean(vals),3),'median':round(statistics.median(vals),3),'p90':round(vals[int((len(vals)-1)*.9)],3),'max':round(max(vals),3)}
def run(label,ext,version,port,browser):
 prof=tempfile.mkdtemp(prefix=f'ud-hot75-{label}-'); errs=[]
 with sync_playwright() as pw:
  c=pw.chromium.launch_persistent_context(prof,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=c.new_page();p.on('pageerror',lambda e:errs.append('pageerror:'+str(e)));p.on('console',lambda m:errs.append('console:'+m.text) if m.type=='error' else None)
   p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=30000);p.wait_for_timeout(1200)
   for n in SEQ:
    p.evaluate('''n=>document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`).click()''',n);p.wait_for_timeout(60)
   layout=[];bridge=[]
   for cycle in range(CYCLES):
    for idx,n in enumerate(SEQ):
     ms=p.evaluate('''n=>{const b=document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`);const t=performance.now();b.click();return performance.now()-t}''',n);layout.append(float(ms));p.wait_for_timeout(50)
     rid=f'{label}-{cycle}-{idx}'
     ms=p.evaluate('''async ({n,id})=>{const t=performance.now();return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('timeout'))},5000);const fn=e=>{let d;try{d=JSON.parse(String(e.detail||'{}'))}catch{}if(d?.requestId!==id)return;cleanup();resolve(performance.now()-t)};const cleanup=()=>{clearTimeout(timer);document.removeEventListener('ultradeck:state',fn,true)};document.addEventListener('ultradeck:state',fn,true);document.dispatchEvent(new CustomEvent('ultradeck:command',{detail:JSON.stringify({type:'setColumns',value:n,requestId:id})}))})}''',{'n':n,'id':rid});bridge.append(float(ms));p.wait_for_timeout(50)
   d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');out={'label':label,'version':version,'layout':stats(layout),'bridge':stats(bridge),'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'errors':errs}
   assert out['retained']==200 and out['geometry']==0 and out['interactions']==0 and not errs;return out
  finally:c.close()
def compare(order):
 s=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');s.socket=tls.wrap_socket(s.socket,server_side=True);threading.Thread(target=s.serve_forever,daemon=True).start();port=s.server_address[1];browser=ensure_isolated_browser()
 try:r=[run(label,ext,version,port,browser) for label,ext,version in order]
 finally:s.shutdown();s.server_close()
 by={x['label']:x for x in r};imp={}
 for grp in ['layout','bridge']:
  for k in ['mean','median','p90','max']:
   a=by['base'][grp][k];z=by['candidate'][grp][k];imp[f'{grp}_{k}']=round((a-z)/a*100,2) if a else None
 return {'results':r,'improvementPositiveMeansCandidateFasterPct':imp}
def main():
 reverse='--reverse' in sys.argv[3:]
 order=[('candidate',CAND,'7.5.0'),('base',BASE,'7.4.0')] if reverse else [('base',BASE,'7.4.0'),('candidate',CAND,'7.5.0')]
 result=compare(order)
 print(json.dumps({'browser':browser_diagnostics(),'cycles':CYCLES,'sequence':SEQ,'reverse':reverse,**result},indent=2))
if __name__=='__main__':main()
