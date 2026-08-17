from __future__ import annotations
import http.server, json, pathlib, socketserver, ssl, statistics, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
V72=pathlib.Path('/mnt/data/UltraDeck-Project/source/UltraDeck-Tumblr-Extension-v7.3.0/dist-manual/chromium-mv3')
V73=ROOT/'dist-manual/chromium-mv3'
SEQUENCE=[6,12,20,8,16,20]
CYCLES=6
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{170+(i*67)%520}px"></div><p>Post {i} {'text '*30 if i%4==0 else ''}</p><button>Like</button></article></div>' for i in range(1,201))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-hot-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def run(label,ext,version,port,browser):
 profile=tempfile.mkdtemp(prefix=f'ud-hot-{label}-'); errors=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
   p.goto(f'https://www.tumblr.com:{port}/dashboard/following',wait_until='domcontentloaded',timeout=60000)
   p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000)
   p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length===200",timeout=30000)
   p.wait_for_timeout(250)
   values=[]
   # warm one cycle, then measure six full cycles from the built-in HUD preset buttons.
   for n in SEQUENCE:
    p.evaluate('''n=>document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`).click()''',n)
    p.wait_for_timeout(70)
   for cycle in range(CYCLES):
    for n in SEQUENCE:
     ms=p.evaluate('''n=>{const b=document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector(`[data-col="${n}"]`);const t=performance.now();b.click();return performance.now()-t}''',n)
     values.append(float(ms));p.wait_for_timeout(70)
   d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
   out={'label':label,'version':version,'samples':len(values),'meanMs':round(statistics.mean(values),3),'medianMs':round(statistics.median(values),3),'p90Ms':round(sorted(values)[int((len(values)-1)*.9)],3),'maxMs':round(max(values),3),'retained':p.locator('#tu-ultrawide-deck-grid .tu-item').count(),'renderedColumns':d['renderedColumns'],'geometryViolations':d['geometryViolations'],'interactionFailures':d['interactionFailures'],'errors':errors,'raw':values}
   assert out['retained']==200 and out['renderedColumns']==20 and out['geometryViolations']==0 and out['interactionFailures']==0 and not errors
   return out
  finally:ctx.close()

def main():
 server=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');server.socket=tls.wrap_socket(server.socket,server_side=True);threading.Thread(target=server.serve_forever,daemon=True).start();port=server.server_address[1]
 browser=ensure_isolated_browser()
 try: rows=[run('v7.3.0',V72,'7.3.0',port,browser),run('v7.4.0',V73,'7.4.0',port,browser)]
 finally:server.shutdown();server.server_close()
 b,n=rows;out={'schema':'ultradeck.layout-hotpath-ab/1','browser':browser_diagnostics(),'cycles':CYCLES,'sequence':SEQUENCE,'results':rows,'improvementPositiveMeansFasterPct':{'mean':round((b['meanMs']-n['meanMs'])/b['meanMs']*100,2),'median':round((b['medianMs']-n['medianMs'])/b['medianMs']*100,2),'p90':round((b['p90Ms']-n['p90Ms'])/b['p90Ms']*100,2),'max':round((b['maxMs']-n['maxMs'])/b['maxMs']*100,2)}}
 target=ROOT/'dist/UltraDeck-v7.4.0-layout-hotpath-ab.json';target.parent.mkdir(exist_ok=True);target.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
