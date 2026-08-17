from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
V72=pathlib.Path('/mnt/data/UltraDeck-Project/source/UltraDeck-Tumblr-Extension-v7.2.0/dist-manual/chromium-mv3')
V73=ROOT/'dist-manual/chromium-mv3'
RUNS=5
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{180+(i*71)%520}px"></div><p>Post {i} {'body '*35 if i%3==0 else ''}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-start-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run_version(label,ext,version,port,browser):
 profile=tempfile.mkdtemp(prefix=f'ud-start-{label}-');rows=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   for run in range(1,RUNS+1):
    errors=[];p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
    t=time.perf_counter();r=p.goto(f'https://www.tumblr.com:{port}/dashboard/following?run={run}',wait_until='domcontentloaded',timeout=60000);assert r and r.status==200
    p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000);runtime=(time.perf_counter()-t)*1000
    p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=30000);ready=(time.perf_counter()-t)*1000
    p.wait_for_timeout(120);d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
    row={'run':run,'runtimeMs':round(runtime,2),'ready200Ms':round(ready,2),'longTaskCount':d['longTaskCount'],'longTaskMs':d['longTaskMs'],'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'geometryViolations':d['geometryViolations'],'interactionFailures':d['interactionFailures'],'errors':errors}
    assert row['retained']==200 and row['geometryViolations']==0 and row['interactionFailures']==0 and not errors
    rows.append(row);p.close()
  finally:ctx.close()
 vals=lambda k:[r[k] for r in rows]
 return {'label':label,'version':version,'runs':rows,'runtimeMs':{'mean':round(statistics.mean(vals('runtimeMs')),2),'median':round(statistics.median(vals('runtimeMs')),2)},'ready200Ms':{'mean':round(statistics.mean(vals('ready200Ms')),2),'median':round(statistics.median(vals('ready200Ms')),2)},'longTaskMs':{'mean':round(statistics.mean(vals('longTaskMs')),2),'median':round(statistics.median(vals('longTaskMs')),2)}}

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser()
 try: results=[run_version('v7.2.0',V72,'7.2.0',port,browser),run_version('v7.3.0',V73,'7.3.0',port,browser)]
 finally:srv.shutdown();srv.server_close()
 b,n=results
 def pct(k,stat):
  a=b[k][stat];z=n[k][stat];return round((a-z)/a*100,2) if a else None
 out={'schema':'ultradeck.startup-reload-ab/1','browser':browser_diagnostics(),'runsPerVersion':RUNS,'results':results,'improvementPositiveMeansFasterPct':{f'{k}_{stat}':pct(k,stat) for k in ['runtimeMs','ready200Ms','longTaskMs'] for stat in ['mean','median']}}
 target=ROOT/'dist/UltraDeck-v7.3.0-startup-reload-ab.json';target.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
