from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]);CAND=pathlib.Path(sys.argv[2]);REVERSE='--reverse' in sys.argv[3:];COUNT=2000;SEQ=[8,20,12,20,6,20]
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{160+(i*61)%420}px"></div><p>Post {i}</p><button>Like</button></article></div>' for i in range(1,COUNT+1))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a></nav><main data-timeline="x">{POSTS}</main><aside>Radar</aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v81-api-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run(label,ext,version,port,browser):
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ud-v81-api-'),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':7680,'height':1600},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);p.wait_for_function(f"window.__TumblrUltraWideDeck.diagnostics().cachedPosts==={COUNT}",timeout=60000);p.wait_for_timeout(250)
   vals=[];returns=[]
   for n in SEQ:
    x=p.evaluate("n=>{const t=performance.now();const d=window.__TumblrUltraWideDeck.setColumns(n);return {ms:performance.now()-t,requested:d.requestedColumns,rendered:d.renderedColumns,cached:d.cachedPosts}}",n);vals.append(float(x['ms']));returns.append(x);assert x['requested']==n and x['cached']==COUNT; assert label!='candidate' or x['rendered']==n
    p.wait_for_timeout(70)
   p.wait_for_timeout(150);d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');assert d['geometryViolations']==0 and d['interactionFailures']==0 and d['cachedPosts']==COUNT and not errors
   return {'label':label,'version':version,'meanMs':round(statistics.mean(vals),2),'medianMs':round(statistics.median(vals),2),'p90Ms':round(sorted(vals)[int((len(vals)-1)*.9)],2),'raw':[round(x,2) for x in vals],'returns':returns,'errors':errors}
  finally:ctx.close()

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();order=[('candidate',CAND,'8.1.0'),('base',BASE,'8.0.0')] if REVERSE else [('base',BASE,'8.0.0'),('candidate',CAND,'8.1.0')]
 try:rows=[run(*x,port,browser) for x in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in rows};b,n=by['base'],by['candidate'];imp={k:round((b[k]-n[k])/b[k]*100,2) for k in ['meanMs','medianMs','p90Ms']}
 print(json.dumps({'browser':browser_diagnostics(),'count':COUNT,'sequence':SEQ,'reverse':REVERSE,'results':rows,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
