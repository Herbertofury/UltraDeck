from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve(); CAND=pathlib.Path(sys.argv[2]).resolve(); PAIRS=int(sys.argv[3]) if len(sys.argv)>3 else 8
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{180+(i*71)%520}px"></div><p>Post {i} {"body "*35 if i%3==0 else ""}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v81-int-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self): self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass
srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
browser=ensure_isolated_browser(); rows={'base':[],'candidate':[]}
def launch(pw,label,ext):
 return pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix=f'ud-v81-int-{label}-'),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
def sample(ctx,label,version,run):
 errors=[];p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None);t=time.perf_counter();r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?{label}={run}',wait_until='domcontentloaded',timeout=30000);assert r and r.status==200;p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=10000);runtime=(time.perf_counter()-t)*1000;p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=15000);ready=(time.perf_counter()-t)*1000;p.wait_for_timeout(80);d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');out={'run':run,'runtimeMs':round(runtime,2),'ready200Ms':round(ready,2),'longTaskMs':d['longTaskMs'],'retained':d['cachedPosts'],'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'errors':errors};assert out['retained']==200 and out['geometry']==0 and out['interactions']==0 and not errors;p.close();return out
with sync_playwright() as pw:
 base=launch(pw,'base',BASE);cand=launch(pw,'candidate',CAND)
 try:
  # One unreported warm-up per loaded extension removes process/extension cold-start asymmetry.
  sample(base,'base','8.0.0','warm'); sample(cand,'candidate','8.1.0','warm')
  for i in range(1,PAIRS+1):
   order=[('base',base,'8.0.0'),('candidate',cand,'8.1.0')] if i%2 else [('candidate',cand,'8.1.0'),('base',base,'8.0.0')]
   for label,ctx,version in order: rows[label].append(sample(ctx,label,version,i))
 finally: base.close();cand.close()
srv.shutdown();srv.server_close()
def stats(label,key):
 v=[r[key] for r in rows[label]];return {'mean':round(statistics.mean(v),2),'median':round(statistics.median(v),2),'p90':round(sorted(v)[min(len(v)-1,max(0,int(len(v)*.9)-1))],2)}
out={'browser':browser_diagnostics(),'pairs':PAIRS,'base':str(BASE),'candidate':str(CAND),'runs':rows,'summary':{label:{k:stats(label,k) for k in ['runtimeMs','ready200Ms','longTaskMs']} for label in rows}}
for key in ['runtimeMs','ready200Ms','longTaskMs']:
 for stat in ['mean','median','p90']:
  a=out['summary']['base'][key][stat];b=out['summary']['candidate'][key][stat];out.setdefault('improvementPositiveMeansCandidateFasterPct',{})[f'{key}_{stat}']=round((a-b)/a*100,2) if a else None
print(json.dumps(out,indent=2))
