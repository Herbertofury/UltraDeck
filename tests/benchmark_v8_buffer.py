from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve(); CAND=pathlib.Path(sys.argv[2]).resolve(); RUNS=int(os.environ.get('ULTRADECK_RUNS','5')); REVERSE='--reverse' in sys.argv[3:]
TARGET=int(os.environ.get('ULTRADECK_BUFFER_TARGET','192'))
def version(p): return json.loads((p/'manifest.json').read_text())['version']
BASE_VERSION=version(BASE); CAND_VERSION=version(CAND)
FIXTURE=(ROOT/'tests/fixtures/tumblr_fixture.html').read_bytes()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-buf-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/img/'):
   data=b'<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"></svg>'; typ='image/svg+xml'
  else: data=FIXTURE; typ='text/html'
  self.send_response(200);self.send_header('Content-Type',typ);self.send_header('Content-Length',str(len(data)));self.end_headers();
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError,ssl.SSLError,OSError):pass
 def log_message(self,*a):pass

def owned_ms(profile):
 nodes={n['id']:n for n in profile['nodes']};parent={}
 for n in profile['nodes']:
  for child in n.get('children',[]):parent[child]=n['id']
 memo={}
 def owned(nid):
  if nid in memo:return memo[nid]
  cur=nid
  while cur:
   url=nodes.get(cur,{}).get('callFrame',{}).get('url','')
   if 'runtime-main.js' in url or '/site-' in url:memo[nid]=True;return True
   cur=parent.get(cur)
  memo[nid]=False;return False
 return sum(dt for nid,dt in zip(profile.get('samples',[]),profile.get('timeDeltas',[])) if owned(nid))/1000

def run_build(label,ext,ver,port,browser):
 profile=tempfile.mkdtemp(prefix=f'ud-v8-buf-{label}-');rows=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   for run in range(1,RUNS+1):
    errors=[];p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
    try:
     r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?run={run}&build={label}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
     p.wait_for_function(f"window.__UltraDeck?.version==='{ver}' && window.__UltraDeck.diagnostics().cachedPosts>=8",timeout=30000)
     p.evaluate("window.__UltraDeck.setSettings({proactiveBuffer:false,turboMedia:false})");p.wait_for_timeout(120)
     before=p.evaluate('window.__UltraDeck.diagnostics()');need=max(1,TARGET-before['cachedPosts'])
     cdp=ctx.new_cdp_session(p);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':100});cdp.send('Profiler.start')
     t=time.perf_counter();p.evaluate("async(n)=>await window.__UltraDeck.buffer(n)",need);elapsed=(time.perf_counter()-t)*1000
     p.wait_for_function(f"window.__UltraDeck.diagnostics().cachedPosts>={TARGET} && window.__UltraDeck.diagnostics().postBuildQueued===0",timeout=60000)
     profile_data=cdp.send('Profiler.stop')['profile'];after=p.evaluate('window.__UltraDeck.diagnostics()')
     row={'run':run,'elapsedMs':round(elapsed,2),'cpuMs':round(owned_ms(profile_data),2),'longTaskDeltaMs':round(after['longTaskMs']-before['longTaskMs'],2),'posts':after['cachedPosts'],'native':after.get('nativeCapturedPosts',after['cachedPosts']),'geometry':after['geometryViolations'],'interactions':after['interactionFailures'],'errors':errors}
     assert row['posts']>=TARGET and row['geometry']==0 and row['interactions']==0 and not errors,row
     rows.append(row)
    finally:p.close()
  finally:ctx.close()
 return {'label':label,'version':ver,'runs':rows,'elapsedMs':stats(rows,'elapsedMs'),'cpuMs':stats(rows,'cpuMs'),'longTaskDeltaMs':stats(rows,'longTaskDeltaMs')}

def stats(rows,key):
 vals=[r[key] for r in rows];return {'mean':round(statistics.mean(vals),2),'median':round(statistics.median(vals),2),'min':round(min(vals),2),'max':round(max(vals),2)}
def main():
 socketserver.ThreadingTCPServer.daemon_threads=True;srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser()
 order=[('candidate',CAND,CAND_VERSION),('base',BASE,BASE_VERSION)] if REVERSE else [('base',BASE,BASE_VERSION),('candidate',CAND,CAND_VERSION)]
 try:results=[run_build(*item,port,browser) for item in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in results};imp={}
 for key in ('elapsedMs','cpuMs','longTaskDeltaMs'):
  a=by['base'][key];z=by['candidate'][key];imp[key]={k:round((a[k]-z[k])/a[k]*100,2) if a[k] else None for k in ('mean','median')}
 print(json.dumps({'browser':browser_diagnostics(),'runs':RUNS,'targetPosts':TARGET,'reverse':REVERSE,'results':results,'improvementPositiveMeansCandidateFasterOrLowerPct':imp},indent=2))
if __name__=='__main__':main()
