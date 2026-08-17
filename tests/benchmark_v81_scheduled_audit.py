from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
EXT=pathlib.Path(sys.argv[1]).resolve(); VERSION=sys.argv[2]; COUNT=int(sys.argv[3]) if len(sys.argv)>3 else 2000; RUNS=int(sys.argv[4]) if len(sys.argv)>4 else 3
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{170+(i*67)%520}px"></div><p>Post {i}</p><button data-testid="like">Like</button></article></div>' for i in range(1,COUNT+1))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a></nav><main data-timeline="x">{POSTS}</main><aside>Radar</aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-audit-bench-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self): self.send_response(200);self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass
srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
rows=[]
with sync_playwright() as pw:
 c=pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ud-audit-bench-p-'),executable_path=str(ensure_isolated_browser()),headless=True,ignore_https_errors=True,viewport={'width':7680,'height':1600},args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
 for run in range(RUNS):
  p=c.new_page();p.goto(f'https://www.tumblr.com:{port}/dashboard/following?r={run}',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{VERSION}'",timeout=20000);p.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length==={COUNT}",timeout=60000);p.wait_for_timeout(300)
  p.evaluate("()=>document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector('[data-col=\"8\"]').click()");p.wait_for_timeout(400)
  result=p.evaluate("""async()=>{const api=window.__TumblrUltraWideDeck;const before=api.diagnostics();let maxLag=0,last=performance.now(),ticks=0;const timer=setInterval(()=>{const now=performance.now();maxLag=Math.max(maxLag,now-last-10);last=now;ticks++},10);const b=document.querySelector('#tu-ultrawide-deck-ui').shadowRoot.querySelector('[data-col=\"20\"]');const t=performance.now();b.click();const clickMs=performance.now()-t;await new Promise(r=>setTimeout(r,700));clearInterval(timer);const after=api.diagnostics();return {clickMs,maxLag,ticks,longTaskMs:after.longTaskMs-before.longTaskMs,longTaskCount:after.longTaskCount-before.longTaskCount,audits:after.geometryAudits-before.geometryAudits,yields:(after.geometryAuditYields||0)-(before.geometryAuditYields||0),cards:(after.geometryAuditCards||0)-(before.geometryAuditCards||0),cached:after.cachedPosts,columns:after.renderedColumns,geometry:after.geometryViolations,interactions:after.interactionFailures}}""")
  rows.append(result);p.close()
 c.close()
srv.shutdown();srv.server_close()
def vals(k): return [float(r[k]) for r in rows]
def stat(k):
 v=vals(k);return {'mean':round(statistics.mean(v),3),'median':round(statistics.median(v),3),'max':round(max(v),3)}
print(json.dumps({'version':VERSION,'count':COUNT,'runs':rows,'summary':{'clickMs':stat('clickMs'),'maxLag':stat('maxLag'),'longTaskMs':stat('longTaskMs'),'longTaskCount':stat('longTaskCount'),'auditYields':stat('yields')}},indent=2))
