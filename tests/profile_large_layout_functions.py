from __future__ import annotations
import http.server,json,pathlib,socketserver,ssl,subprocess,sys,tempfile,threading
from collections import defaultdict
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser
EXT=pathlib.Path(sys.argv[1]).resolve(); VERSION=sys.argv[2]; COUNT=int(sys.argv[3]) if len(sys.argv)>3 else 2000
POSTS=''.join(f'<div tabindex="-1" data-id="{i}"><article><div style="height:{170+(i*67)%520}px"></div><p>Post {i} {"text "*20 if i%4==0 else ""}</p><button data-testid="like">Like</button></article></div>' for i in range(1,COUNT+1))
HTML=f'<!doctype html><html><body><nav><a href="/dashboard">Home</a></nav><main data-timeline="x">{POSTS}</main><aside>Radar</aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script></body></html>'.encode()
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-large-prof-'));subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self): self.send_response(200);self.send_header('Content-Length',str(len(HTML)));self.end_headers();self.wfile.write(HTML)
 def log_message(self,*a):pass
srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
with sync_playwright() as pw:
 c=pw.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ud-large-prof-p-'),executable_path=str(ensure_isolated_browser()),headless=True,ignore_https_errors=True,viewport={'width':7680,'height':1600},args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
 p=c.new_page();p.goto(f'https://www.tumblr.com:{port}/dashboard/following',wait_until='domcontentloaded',timeout=60000);p.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{VERSION}'",timeout=20000);p.wait_for_function(f"document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item').length==={COUNT}",timeout=60000);p.wait_for_timeout(250)
 p.evaluate("window.__TumblrUltraWideDeck.setColumns(8)");p.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===8",timeout=10000);p.wait_for_timeout(100)
 cdp=c.new_cdp_session(p);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':100});cdp.send('Profiler.start')
 elapsed=p.evaluate("()=>{const t=performance.now();window.__TumblrUltraWideDeck.setColumns(20);return performance.now()-t}")
 p.wait_for_timeout(160);prof=cdp.send('Profiler.stop')['profile'];d=p.evaluate('window.__TumblrUltraWideDeck.diagnostics()');c.close()
srv.shutdown();srv.server_close()
nodes={n['id']:n for n in prof['nodes']};agg=defaultdict(float);urlagg=defaultdict(float)
for nid,delta in zip(prof.get('samples',[]),prof.get('timeDeltas',[])):
 cf=nodes[nid].get('callFrame',{});name=cf.get('functionName') or '(anonymous)';url=cf.get('url','')
 if 'runtime-main.js' in url or 'site-tumblr.js' in url:agg[(name,url.rsplit('/',1)[-1])]+=delta/1000;urlagg[url.rsplit('/',1)[-1]]+=delta/1000
print(json.dumps({'version':VERSION,'count':COUNT,'callElapsedMs':round(elapsed,3),'retained':d['cachedPosts'],'columns':d['renderedColumns'],'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'totalByUrl':urlagg,'top':[{'fn':k[0],'file':k[1],'ms':round(v,3)} for k,v in sorted(agg.items(),key=lambda kv:-kv[1])[:35]]},indent=2,default=dict))
