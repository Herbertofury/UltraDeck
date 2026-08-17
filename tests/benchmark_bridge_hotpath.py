from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
V72=pathlib.Path('/mnt/data/UltraDeck-Project/source/UltraDeck-Tumblr-Extension-v7.2.0/dist-manual/chromium-mv3');V73=ROOT/'dist-manual/chromium-mv3'
SEQ=[6,12,20,8,16,20];CYCLES=6
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{160+(i*53)%420}px"></div><p>Post {i}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-bridge-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run(label,ext,version,port,browser):
 prof=tempfile.mkdtemp(prefix='ud-bridge-');errs=[]
 with sync_playwright() as pw:
  c=pw.chromium.launch_persistent_context(prof,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=c.new_page();p.on('pageerror',lambda e:errs.append(str(e)));p.on('console',lambda m:errs.append(m.text) if m.type=='error' else None);p.goto(f'https://www.tumblr.com:{port}/dashboard/following',wait_until='domcontentloaded');p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'");p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200");p.wait_for_timeout(200)
   vals=[]
   for cycle in range(CYCLES):
    for idx,n in enumerate(SEQ):
     ms=p.evaluate('''async ({n,id})=>{const t=performance.now();return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('timeout'))},5000);const fn=e=>{let d;try{d=JSON.parse(String(e.detail||'{}'))}catch{}if(d?.requestId!==id)return;cleanup();resolve(performance.now()-t)};const cleanup=()=>{clearTimeout(timer);document.removeEventListener('ultradeck:state',fn,true)};document.addEventListener('ultradeck:state',fn,true);document.dispatchEvent(new CustomEvent('ultradeck:command',{detail:JSON.stringify({type:'setColumns',value:n,requestId:id})}))})}''',{'n':n,'id':f'{label}-{cycle}-{idx}'})
     vals.append(float(ms));p.wait_for_timeout(55)
   d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');out={'label':label,'version':version,'samples':len(vals),'meanMs':round(statistics.mean(vals),3),'medianMs':round(statistics.median(vals),3),'p90Ms':round(sorted(vals)[int((len(vals)-1)*.9)],3),'maxMs':round(max(vals),3),'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'geometryViolations':d['geometryViolations'],'interactionFailures':d['interactionFailures'],'errors':errs,'raw':vals};assert out['retained']==200 and out['geometryViolations']==0 and out['interactionFailures']==0 and not errs;return out
  finally:c.close()

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser()
 try:r=[run('v7.2.0',V72,'7.2.0',port,browser),run('v7.3.0',V73,'7.3.0',port,browser)]
 finally:srv.shutdown();srv.server_close()
 b,n=r;out={'schema':'ultradeck.bridge-hotpath-ab/1','browser':browser_diagnostics(),'cycles':CYCLES,'sequence':SEQ,'results':r,'improvementPositiveMeansFasterPct':{k:round((b[k]-n[k])/b[k]*100,2) for k in ['meanMs','medianMs','p90Ms','maxMs']}};target=ROOT/'dist/UltraDeck-v7.3.0-bridge-hotpath-ab.json';target.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
