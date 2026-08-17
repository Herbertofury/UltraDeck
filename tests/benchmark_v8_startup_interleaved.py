from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve();CAND=pathlib.Path(sys.argv[2]).resolve();RUNS=int(os.environ.get('ULTRADECK_RUNS','20'))
def ver(p):return json.loads((p/'manifest.json').read_text())['version']
BV,CV=ver(BASE),ver(CAND)
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{180+(i*71)%520}px"></div><p>Post {i} {"body "*35 if i%3==0 else ""}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-pair-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k.pem'),'-out',str(CERT/'c.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(HTML)));self.end_headers()
  try:self.wfile.write(HTML)
  except Exception:pass
 def log_message(self,*a):pass

def launch(pw,browser,ext,label):
 return pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix=f'ud-v8-pair-{label}-'),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
def one(ctx,label,version,port,run):
 p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 try:
  t=time.perf_counter();r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?pair={run}&build={label}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
  p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);runtime=(time.perf_counter()-t)*1000
  p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=30000);ready=(time.perf_counter()-t)*1000
  p.wait_for_timeout(80);d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
  row={'runtimeMs':round(runtime,2),'ready200Ms':round(ready,2),'longTaskMs':d['longTaskMs'],'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'errors':errors}
  assert row['retained']==200 and row['geometry']==0 and row['interactions']==0 and not errors,row
  return row
 finally:p.close()
def stats(rows,key):
 vals=[r[key] for r in rows];return {'mean':round(statistics.mean(vals),2),'median':round(statistics.median(vals),2),'p90':round(sorted(vals)[max(0,min(len(vals)-1,int(len(vals)*.9)-1))],2)}
def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c.pem',CERT/'k.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();base=[];cand=[];pairs=[]
 with sync_playwright() as pw:
  bctx=launch(pw,browser,BASE,'base');cctx=launch(pw,browser,CAND,'candidate')
  try:
   # one untimed primer page in each already-running process
   for ctx,label,v in ((bctx,'base',BV),(cctx,'candidate',CV)):
    p=ctx.new_page();p.goto(f'https://www.tumblr.com:{port}/dashboard/following?primer={label}',wait_until='domcontentloaded');p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{v}'");p.close()
   for i in range(1,RUNS+1):
    order=[('base',bctx,BV),('candidate',cctx,CV)] if i%2 else [('candidate',cctx,CV),('base',bctx,BV)]
    got={}
    for label,ctx,v in order: got[label]=one(ctx,label,v,port,i)
    base.append(got['base']);cand.append(got['candidate']);pairs.append({'run':i,'first':order[0][0],'base':got['base'],'candidate':got['candidate'],'readyDeltaMs':round(got['candidate']['ready200Ms']-got['base']['ready200Ms'],2)})
  finally:bctx.close();cctx.close();srv.shutdown();srv.server_close()
 out={'browser':browser_diagnostics(),'runs':RUNS,'baseVersion':BV,'candidateVersion':CV,'pairs':pairs,'base':{k:stats(base,k) for k in ('runtimeMs','ready200Ms','longTaskMs')},'candidate':{k:stats(cand,k) for k in ('runtimeMs','ready200Ms','longTaskMs')}}
 out['improvementPositiveMeansCandidateFasterPct']={k+'_'+s:round((out['base'][k][s]-out['candidate'][k][s])/out['base'][k][s]*100,2) if out['base'][k][s] else None for k in ('runtimeMs','ready200Ms','longTaskMs') for s in ('mean','median')}
 print(json.dumps(out,indent=2))
if __name__=='__main__':main()
