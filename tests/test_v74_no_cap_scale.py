from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,sys,tempfile,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve();VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.2.0')
from policy_isolated_browser import ensure_isolated_browser,diagnostics as browser_diagnostics
COUNT=2000
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{120+(i*47)%420}px"></div><p>Post {i} {"body "*20 if i%5==0 else ""}</p><button>Like</button></article></div>' for i in range(1,COUNT+1))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a><a href="/activity">Activity</a></nav><main data-timeline="x">{POSTS}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-scale-cert-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass

def main():
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser();profile=tempfile.mkdtemp(prefix='ud-scale-profile-');ext=EXT;errors=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':7680,'height':1600},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
  try:
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None);t=time.perf_counter();p.goto(f'https://www.tumblr.com:{port}/dashboard/following',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==={VERSION!r}",timeout=30000);p.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length==={COUNT}",timeout=90000);ready=round((time.perf_counter()-t)*1000,1)
   p.evaluate("window.__TumblrUltraWideDeck.setColumns(20)");p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column').length===20",timeout=10000);p.wait_for_timeout(250);p.evaluate('window.__TumblrUltraWideDeck.audit()');p.wait_for_timeout(300)
   d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');stats=p.evaluate('''()=>{const items=[...document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item')];return {items:items.length,hidden:items.filter(i=>getComputedStyle(i).display==='none'||getComputedStyle(i).visibility==='hidden').length,contentVisibility:items.filter(i=>getComputedStyle(i).contentVisibility!=='visible').length,directColumns:document.querySelectorAll('#tu-ultrawide-deck-grid > .tu-column').length}}''')
   out={'browser':browser_diagnostics(),'readyMs':ready,'count':COUNT,'stats':stats,'diagnostics':{k:d.get(k) for k in ['version','cachedPosts','visibleItems','requestedColumns','renderedColumns','geometryViolations','interactionFailures','longTaskCount','longTaskMs','fullScans','fullScanSkips']},'errors':errors};print(json.dumps(out,indent=2));assert stats['items']==COUNT and stats['hidden']==0 and stats['contentVisibility']==0 and stats['directColumns']==20 and d['cachedPosts']==COUNT and d['geometryViolations']==0 and d['interactionFailures']==0 and not errors
  finally:ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
