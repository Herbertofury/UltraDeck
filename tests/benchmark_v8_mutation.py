from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]); CAND=pathlib.Path(sys.argv[2]); REVERSE='--reverse' in sys.argv[3:]; RUNS=int(os.environ.get('ULTRADECK_RUNS','5'))
def ext_version(path, fallback):
 try:return json.loads((path/'manifest.json').read_text())['version']
 except Exception:return fallback
BASE_VERSION=os.environ.get('ULTRADECK_BASE_VERSION') or ext_version(BASE,'7.5.0')
CAND_VERSION=os.environ.get('ULTRADECK_CAND_VERSION') or ext_version(CAND,'8.0.0')
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{180+(i*71)%520}px"></div><p>Post {i}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-mut-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def runtime_cpu_ms(profile):
 nodes={n['id']:n for n in profile['nodes']}; parent={}
 for n in profile['nodes']:
  for c in n.get('children',[]): parent[c]=n['id']
 memo={}
 def owned(nid):
  if nid in memo:return memo[nid]
  cur=nid
  while cur:
   cf=nodes.get(cur,{}).get('callFrame',{});url=cf.get('url','')
   if 'runtime-main.js' in url: memo[nid]=True;return True
   cur=parent.get(cur)
  memo[nid]=False;return False
 return sum(delta for nid,delta in zip(profile.get('samples',[]),profile.get('timeDeltas',[])) if owned(nid))/1000

def run_version(label,ext,version,port,browser):
 profile=tempfile.mkdtemp(prefix=f'ud-v8-mut-{label}-'); rows=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   for run in range(1,RUNS+1):
    errors=[];p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
    p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}={run}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=30000);p.wait_for_timeout(120)
    before=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()'); cdp=ctx.new_cdp_session(p);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':100});cdp.send('Profiler.start')
    p.evaluate('''() => { const posts=[...document.querySelectorAll('main [data-id] article')]; for(let round=0;round<25;round++){ for(const article of posts){ const span=document.createElement('span'); span.textContent='mutation'; article.appendChild(span); span.remove(); } } }''')
    p.wait_for_timeout(350);prof=cdp.send('Profiler.stop')['profile'];after=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
    row={'run':run,'runtimeCpuMs':round(runtime_cpu_ms(prof),2),'longTaskDeltaMs':round(after['longTaskMs']-before['longTaskMs'],2),'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'geometryViolations':after['geometryViolations'],'interactionFailures':after['interactionFailures'],'errors':errors}
    assert row['retained']==200 and row['geometryViolations']==0 and row['interactionFailures']==0 and not errors
    rows.append(row);p.close()
  finally:ctx.close()
 vals=lambda k:[r[k] for r in rows]
 return {'label':label,'version':version,'runs':rows,**{k:{'mean':round(statistics.mean(vals(k)),2),'median':round(statistics.median(vals(k)),2)} for k in ['runtimeCpuMs','longTaskDeltaMs']}}

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();order=[('candidate',CAND,CAND_VERSION),('base',BASE,BASE_VERSION)] if REVERSE else [('base',BASE,BASE_VERSION),('candidate',CAND,CAND_VERSION)]
 try:results=[run_version(label,ext,version,port,browser) for label,ext,version in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in results};imp={}
 for k in ['runtimeCpuMs','longTaskDeltaMs']:
  for st in ['mean','median']:
   a=by['base'][k][st];z=by['candidate'][k][st];imp[f'{k}_{st}']=round((a-z)/a*100,2) if a else None
 print(json.dumps({'browser':browser_diagnostics(),'runsPerBuild':RUNS,'reverse':REVERSE,'results':results,'improvementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
