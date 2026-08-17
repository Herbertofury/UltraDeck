from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve();CAND=pathlib.Path(sys.argv[2]).resolve();RUNS=int(os.environ.get('ULTRADECK_RUNS','5'));REVERSE='--reverse' in sys.argv[3:]
def ver(p):return json.loads((p/'manifest.json').read_text())['version']
BV=ver(BASE);CV=ver(CAND);FIX=(ROOT/'tests/fixtures/tumblr_fixture.html').read_bytes();CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-reg-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k.pem'),'-out',str(CERT/'c.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/img/'):data=b'<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"></svg>';typ='image/svg+xml'
  else:data=FIX;typ='text/html'
  self.send_response(200);self.send_header('Content-Type',typ);self.send_header('Content-Length',str(len(data)));self.end_headers();
  try:self.wfile.write(data)
  except Exception:pass
 def log_message(self,*a):pass

def run_build(label,ext,version,port,browser):
 prof=tempfile.mkdtemp(prefix=f'ud-reg-{label}-');rows=[]
 with sync_playwright() as pw:
  c=pw.chromium.launch_persistent_context(prof,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   for run in range(1,RUNS+1):
    errors=[];p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    try:
     r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}={run}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
     p.wait_for_function(f"window.__UltraDeck?.version==='{version}' && window.__UltraDeck.diagnostics().cachedPosts>=8",timeout=30000)
     p.evaluate("window.__UltraDeck.setSettings({proactiveBuffer:false,turboMedia:false})")
     # Activate the native registry while only the first virtualizer window is mounted.
     first=p.evaluate("()=>window.__UltraDeck.interact('1','menu')");assert first['ok'],first
     # A real interaction intentionally holds a short native-scroll lease. Wait for it to
     # expire before timing/manual buffering; proactive buffering is disabled in this test.
     p.wait_for_function("!window.__UltraDeck.diagnostics().nativeInteractionLeaseActive",timeout=10000)
     p.evaluate("async()=>await window.__UltraDeck.buffer(184)")
     p.wait_for_function("window.__UltraDeck.diagnostics().cachedPosts>=192",timeout=60000)
     # Park the native virtualizer at the far end so early IDs are physically unmounted.
     p.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)");p.wait_for_timeout(180)
     ids=['1','33','65','97','129','161','185'];times=[]
     for pid in ids:
      t=time.perf_counter();res=p.evaluate("([id])=>window.__UltraDeck.interact(id,'menu')",[pid]);times.append((time.perf_counter()-t)*1000);assert res['ok'],(pid,res)
     d=p.evaluate('window.__UltraDeck.diagnostics()')
     row={'meanActionMs':round(statistics.mean(times),2),'medianActionMs':round(statistics.median(times),2),'maxActionMs':round(max(times),2),'registrySize':d.get('mountedSourceRegistrySize'),'mountedLive':d.get('mountedNativeSources'),'posts':d['cachedPosts'],'failures':d['interactionFailures'],'geometry':d['geometryViolations'],'errors':errors}
     assert row['posts']>=192 and row['failures']==0 and row['geometry']==0 and not errors,row
     rows.append(row)
    finally:p.close()
  finally:c.close()
 def stat(k):
  vals=[r[k] for r in rows];return {'mean':round(statistics.mean(vals),2),'median':round(statistics.median(vals),2)}
 return {'label':label,'version':version,'runs':rows,'meanActionMs':stat('meanActionMs'),'medianActionMs':stat('medianActionMs'),'maxActionMs':stat('maxActionMs')}

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c.pem',CERT/'k.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser()
 order=[('candidate',CAND,CV),('base',BASE,BV)] if REVERSE else [('base',BASE,BV),('candidate',CAND,CV)]
 try:results=[run_build(*x,port,browser) for x in order]
 finally:srv.shutdown();srv.server_close()
 by={x['label']:x for x in results};imp={}
 for metric in ['meanActionMs','medianActionMs','maxActionMs']:
  imp[metric]={k:round((by['base'][metric][k]-by['candidate'][metric][k])/by['base'][metric][k]*100,2) if by['base'][metric][k] else None for k in ['mean','median']}
 print(json.dumps({'browser':browser_diagnostics(),'runs':RUNS,'reverse':REVERSE,'results':results,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
