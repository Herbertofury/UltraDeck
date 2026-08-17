from __future__ import annotations
import hashlib,http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]);CAND=pathlib.Path(sys.argv[2]);REVERSE='--reverse' in sys.argv[3:]
SEQUENCE=[6,12,20,8,16,20];CYCLES=4;COUNT=1000
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{170+(i*67)%520}px"></div><p>Post {i} {"text "*30 if i%4==0 else ""}</p><button>Like</button></article></div>' for i in range(1,COUNT+1))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-large-layout-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run(label,ext,port,browser):
 profile=tempfile.mkdtemp(prefix=f'ud-large-{label}-');errors=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':7680,'height':1600},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
   p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function("window.__TumblrUltraWideDeck?.version==='7.4.0'",timeout=20000);p.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length==={COUNT}",timeout=60000);p.wait_for_timeout(250)
   for n in SEQUENCE:
    p.evaluate('''n=>document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`).click()''',n);p.wait_for_timeout(50)
   vals=[]
   for _ in range(CYCLES):
    for n in SEQUENCE:
     vals.append(float(p.evaluate('''n=>{const b=document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`);const t=performance.now();b.click();return performance.now()-t}''',n)));p.wait_for_timeout(50)
   p.wait_for_timeout(180);d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');directCols=p.locator('#tu-ultrawide-deck-grid > .tu-column').count();layout=p.evaluate('''()=>[...document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column')].map(c=>[...c.querySelectorAll(':scope > .tu-item')].map(i=>i.dataset.tuItem))''');sig=hashlib.sha256(json.dumps(layout,separators=(',',':')).encode()).hexdigest()
   out={'label':label,'samples':len(vals),'meanMs':round(statistics.mean(vals),3),'medianMs':round(statistics.median(vals),3),'p90Ms':round(sorted(vals)[int((len(vals)-1)*.9)],3),'maxMs':round(max(vals),3),'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'renderedColumns':d['renderedColumns'],'directColumns':directCols,'requestedColumns':d['requestedColumns'],'geometryViolations':d['geometryViolations'],'interactionFailures':d['interactionFailures'],'layoutSignature':sig,'errors':errors,'raw':vals}
   assert out['retained']==COUNT and out['directColumns']==20 and out['requestedColumns']==20 and out['geometryViolations']==0 and out['interactionFailures']==0 and not errors
   return out
  finally:ctx.close()

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();order=[('candidate',CAND),('base',BASE)] if REVERSE else [('base',BASE),('candidate',CAND)]
 try:rows=[run(label,ext,port,browser) for label,ext in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in rows};assert by['base']['layoutSignature']==by['candidate']['layoutSignature'],'placement changed'
 b,n=by['base'],by['candidate'];imp={k:round((b[k]-n[k])/b[k]*100,2) for k in ['meanMs','medianMs','p90Ms','maxMs'] if b[k]}
 print(json.dumps({'browser':browser_diagnostics(),'count':COUNT,'cycles':CYCLES,'sequence':SEQUENCE,'reverse':REVERSE,'results':rows,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
