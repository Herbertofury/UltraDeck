from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,statistics,subprocess,sys,tempfile,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
BASE=pathlib.Path(sys.argv[1]).resolve(); CAND=pathlib.Path(sys.argv[2]).resolve(); RUNS=int(os.environ.get('ULTRADECK_RUNS','4')); ROUNDS=int(os.environ.get('ULTRADECK_MUTATION_ROUNDS','25')); REVERSE='--reverse' in sys.argv[3:]
def version(p): return json.loads((p/'manifest.json').read_text())['version']
BASE_VERSION=version(BASE); CAND_VERSION=version(CAND)
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v8-ms-mut-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def posts(site,count=200):
 out=[]
 for i in range(1,count+1):
  if site=='tumblr': out.append(f'<div tabindex="-1" data-id="{i}"><article><a href="/post/{i}">Post {i}</a><p data-body>Body {i}</p><button data-testid="like">Like</button></article></div>')
  elif site=='x': out.append(f'<article data-testid="tweet"><a href="/user/status/{1000000+i}">Post {i}</a><p data-body>Body {i}</p><button data-testid="like">Like</button></article>')
  else: out.append(f'<article><a href="/posts/example-{2000000+i}">Post {i}</a><p data-body>Body {i}</p><button aria-label="Like">Like</button></article>')
 return ''.join(out)

def html(host):
 if host.startswith('www.tumblr.com'):
  site='tumblr'; body=f'<nav><a href="/dashboard">Home</a></nav><main data-timeline="dashboard">{posts(site)}</main><aside>Radar</aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}}</script>'
 elif host.startswith('www.patreon.com'):
  site='patreon'; body=f'<nav><a href="/home">Home</a></nav><main role="main">{posts(site)}</main><aside>Membership</aside>'
 else:
  site='x'; body=f'<nav><a href="/home">Home</a></nav><main><section aria-label="Timeline: Home">{posts(site)}</section></main><aside data-testid="sidebarColumn">What is happening</aside>'
 return f'<!doctype html><html><body>{body}</body></html>'.encode()

class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  data=html(self.headers.get('Host','')); self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def log_message(self,*a): pass

def owned_ms(profile):
 nodes={n['id']:n for n in profile['nodes']}; parent={}
 for n in profile['nodes']:
  for child in n.get('children',[]): parent[child]=n['id']
 memo={}
 def owned(nid):
  if nid in memo:return memo[nid]
  cur=nid
  while cur:
   url=nodes.get(cur,{}).get('callFrame',{}).get('url','')
   if 'runtime-main.js' in url or '/site-' in url: memo[nid]=True;return True
   cur=parent.get(cur)
  memo[nid]=False;return False
 return sum(dt for nid,dt in zip(profile.get('samples',[]),profile.get('timeDeltas',[])) if owned(nid))/1000

def run_one(ext,ver,site,host,path,port,browser,run):
 prof=tempfile.mkdtemp(prefix=f'ud-v8-ms-mut-{site}-'); errors=[]
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(prof,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':2560,'height':1100},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1, MAP www.patreon.com 127.0.0.1, MAP x.com 127.0.0.1'])
  try:
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
   r=p.goto(f'https://{host}:{port}{path}?run={run}',wait_until='domcontentloaded',timeout=60000); assert r and r.status==200
   p.wait_for_function(f"window.__UltraDeck?.version==='{ver}' && window.__UltraDeck.diagnostics().site==='{site}'",timeout=30000)
   p.wait_for_function("window.__UltraDeck.diagnostics().cachedPosts===200",timeout=30000)
   p.evaluate("window.__UltraDeck.setSettings({proactiveBuffer:false})");p.wait_for_timeout(200)
   before=p.evaluate('window.__UltraDeck.diagnostics()');cdp=ctx.new_cdp_session(p);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':100});cdp.send('Profiler.start')
   p.evaluate(f"""() => {{ const bodies=[...document.querySelectorAll('[data-body]')]; for(let round=0;round<{ROUNDS};round++){{ for(const body of bodies){{ const s=document.createElement('span');s.textContent='m';body.appendChild(s);s.remove(); }} }} }}""")
   p.wait_for_timeout(300);profile=cdp.send('Profiler.stop')['profile'];after=p.evaluate('window.__UltraDeck.diagnostics()')
   row={'cpuMs':round(owned_ms(profile),2),'longTaskDeltaMs':round(after['longTaskMs']-before['longTaskMs'],2),'posts':after['cachedPosts'],'geometry':after['geometryViolations'],'interactions':after['interactionFailures'],'errors':errors}
   assert row['posts']==200 and row['geometry']==0 and row['interactions']==0 and not errors,row
   return row
  finally:ctx.close()

def stats(rows,key):
 vals=[r[key] for r in rows];return {'mean':round(statistics.mean(vals),2),'median':round(statistics.median(vals),2)}
def run_build(label,ext,ver,sites,port,browser):
 out={}
 for site,host,path in sites:
  rows=[run_one(ext,ver,site,host,path,port,browser,i) for i in range(1,RUNS+1)]
  out[site]={'runs':rows,'cpuMs':stats(rows,'cpuMs'),'longTaskDeltaMs':stats(rows,'longTaskDeltaMs')}
 return {'label':label,'version':ver,'sites':out}

def main():
 all_sites=[('tumblr','www.tumblr.com','/dashboard/following'),('patreon','www.patreon.com','/home'),('x','x.com','/home')]
 wanted={x.strip() for x in os.environ.get('ULTRADECK_SITES','').split(',') if x.strip()}
 sites=[item for item in all_sites if not wanted or item[0] in wanted]
 if not sites: raise SystemExit('ULTRADECK_SITES selected no supported site')
 socketserver.ThreadingTCPServer.daemon_threads=True;srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1];browser=ensure_isolated_browser()
 order=[('candidate',CAND,CAND_VERSION),('base',BASE,BASE_VERSION)] if REVERSE else [('base',BASE,BASE_VERSION),('candidate',CAND,CAND_VERSION)]
 try: results=[run_build(*item,sites,port,browser) for item in order]
 finally:srv.shutdown();srv.server_close()
 by={r['label']:r for r in results};imp={}
 for site,_,_ in sites:
  a=by['base']['sites'][site]['cpuMs'];z=by['candidate']['sites'][site]['cpuMs']
  imp[site]={k:round((a[k]-z[k])/a[k]*100,2) if a[k] else None for k in ('mean','median')}
 print(json.dumps({'browser':browser_diagnostics(),'runsPerSite':RUNS,'mutationRounds':ROUNDS,'reverse':REVERSE,'results':results,'cpuImprovementPositiveMeansCandidateFasterPct':imp},indent=2))
if __name__=='__main__':main()
