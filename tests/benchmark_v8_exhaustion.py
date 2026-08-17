from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve();CAND=pathlib.Path(sys.argv[2]).resolve();RUNS=int(os.environ.get('ULTRADECK_RUNS','4'));REVERSE='--reverse' in sys.argv[3:];TARGET=int(os.environ.get('ULTRADECK_EXHAUST_TARGET','240'))
def ver(p):return json.loads((p/'manifest.json').read_text())['version']
BV,CV=ver(BASE),ver(CAND);FIX=(ROOT/'tests/fixtures/tumblr_fixture.html').read_bytes();CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-exhaust-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k.pem'),'-out',str(CERT/'c.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  data=FIX;typ='text/html'
  if self.path.startswith('/img/'):data=b'<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"></svg>';typ='image/svg+xml'
  self.send_response(200);self.send_header('Content-Type',typ);self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except Exception:pass
 def log_message(self,*a):pass

def run_build(label,ext,version,port,browser):
 prof=tempfile.mkdtemp(prefix=f'ud-exhaust-{label}-');rows=[]
 with sync_playwright() as pw:
  c=pw.chromium.launch_persistent_context(prof,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   for run in range(RUNS):
    p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    try:
     r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}={run}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
     p.wait_for_function(f"window.__UltraDeck?.version==='{version}' && window.__UltraDeck.diagnostics().cachedPosts>=8",timeout=30000)
     p.evaluate("window.__UltraDeck.setSettings({proactiveBuffer:false,turboMedia:false})");p.wait_for_timeout(180)
     before=p.evaluate('window.__UltraDeck.diagnostics()');need=max(1,TARGET-before['cachedPosts'])
     t=time.perf_counter();p.evaluate("async(n)=>await window.__UltraDeck.buffer(n)",need);elapsed=(time.perf_counter()-t)*1000
     after=p.evaluate('window.__UltraDeck.diagnostics()')
     row={'elapsedMs':round(elapsed,2),'posts':after['cachedPosts'],'native':after.get('nativeCapturedPosts',after['cachedPosts']),'pumpFailures':after.get('pumpFailures'),'geometry':after['geometryViolations'],'interactions':after['interactionFailures'],'errors':errors}
     assert row['posts']>=200 and row['posts']<TARGET and row['geometry']==0 and row['interactions']==0 and not errors,row
     rows.append(row)
    finally:p.close()
  finally:c.close()
 vals=[r['elapsedMs'] for r in rows]
 return {'label':label,'version':version,'runs':rows,'elapsedMs':{'mean':round(statistics.mean(vals),2),'median':round(statistics.median(vals),2),'min':round(min(vals),2),'max':round(max(vals),2)}}
def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c.pem',CERT/'k.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();order=[('candidate',CAND,CV),('base',BASE,BV)] if REVERSE else [('base',BASE,BV),('candidate',CAND,CV)]
 try:res=[run_build(*x,port,browser) for x in order]
 finally:srv.shutdown();srv.server_close()
 by={x['label']:x for x in res};b=by['base']['elapsedMs'];c=by['candidate']['elapsedMs'];imp={k:round((b[k]-c[k])/b[k]*100,2) for k in ('mean','median')}
 print(json.dumps({'browser':browser_diagnostics(),'runs':RUNS,'target':TARGET,'reverse':REVERSE,'results':res,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
