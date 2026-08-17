from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]);CAND=pathlib.Path(sys.argv[2]);REVERSE='--reverse' in sys.argv[3:]
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><button data-testid="caret" aria-haspopup="menu" aria-label="More">More</button><button data-testid="like" aria-label="Like">Like</button><p style="height:80px">Post {i}</p></article></div>' for i in range(1,33))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a></nav><main data-timeline="x">{POSTS}</main><aside>Radar</aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v81-int-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run(label,ext,version,port,browser):
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ud-v81-int-'),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=ctx.new_page();errs=[];p.on('pageerror',lambda e:errs.append(str(e)));p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);p.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().cachedPosts===32",timeout=20000);p.evaluate("window.__TumblrUltraWideDeck.setColumns(8)");p.wait_for_timeout(100)
   vals=[]
   for _ in range(12):
    t=time.perf_counter();r=p.evaluate("window.__TumblrUltraWideDeck.interact('2','like')");vals.append((time.perf_counter()-t)*1000);assert r['ok']
    p.wait_for_timeout(15)
   like_stage=p.evaluate("window.__TumblrUltraWideDeck.diagnostics().actionStageActive")
   # spatial menu must still stage in both versions
   mr=p.evaluate("window.__TumblrUltraWideDeck.interact('2','menu')");menu_stage=p.evaluate("window.__TumblrUltraWideDeck.diagnostics().actionStageActive");assert mr['ok'] and menu_stage
   d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');assert d['geometryViolations']==0 and d['interactionFailures']==0 and not errs
   return {'label':label,'version':version,'meanMs':round(statistics.mean(vals),3),'medianMs':round(statistics.median(vals),3),'p90Ms':round(sorted(vals)[int((len(vals)-1)*.9)],3),'likeStageActive':like_stage,'menuStageActive':menu_stage,'raw':[round(x,3) for x in vals]}
  finally:ctx.close()

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();order=[('candidate',CAND,'8.1.0'),('base',BASE,'8.0.0')] if REVERSE else [('base',BASE,'8.0.0'),('candidate',CAND,'8.1.0')]
 try:rows=[run(*x,port,browser) for x in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in rows};b,n=by['base'],by['candidate'];imp={k:round((b[k]-n[k])/b[k]*100,2) for k in ['meanMs','medianMs','p90Ms']}
 print(json.dumps({'browser':browser_diagnostics(),'reverse':REVERSE,'results':rows,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
