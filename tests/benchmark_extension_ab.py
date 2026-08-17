import http.server, socketserver, ssl, threading, tempfile, pathlib, time, json, sys, subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
CERTDIR=pathlib.Path(tempfile.mkdtemp(prefix='ud-ab-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERTDIR/'key.pem'),'-out',str(CERTDIR/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
POSTS=''.join(f'''<div tabindex="-1" data-id="{i}"><article><figure><div style="height:{160+(i*83)%620}px;background:#234"></div></figure><p>Post {i} {'long content '*40 if i%3==0 else ''}</p><button data-testid="like">Like</button></article></div>''' for i in range(1,201))
HTML=f'''<!doctype html><html><head><meta charset="utf-8"><title>AB</title></head><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a></nav><main data-timeline="/api/v2/timeline/dashboard">{POSTS}</main><aside aria-label="Sidebar"><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true}};</script></body></html>'''.encode()
class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(HTML))); self.end_headers(); self.wfile.write(HTML)
    def log_message(self,*a): pass

def run_case(label, ext, version, port, browser):
    profile=pathlib.Path(tempfile.mkdtemp(prefix=f'ud-ab-{label}-')); errors=[]
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
        try:
            page=ctx.new_page(); page.on('pageerror',lambda e:errors.append('pageerror: '+str(e))); page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
            t0=time.perf_counter(); r=page.goto(f'https://www.tumblr.com:{port}/dashboard/following',wait_until='domcontentloaded',timeout=60000); assert r and r.status==200
            page.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{version}'",timeout=20000)
            runtime_ms=(time.perf_counter()-t0)*1000
            page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=200",timeout=30000)
            page.wait_for_timeout(600)
            ready_ms=(time.perf_counter()-t0)*1000
            initial=page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
            transitions=[]
            before_count=initial['longTaskCount']; before_ms=initial['longTaskMs']
            for n in [6,12,20,8,16,20]:
                st=time.perf_counter(); page.evaluate(f'window.__TumblrUltraWideDeck.setColumns({n})'); page.wait_for_function(f'window.__TumblrUltraWideDeck.diagnostics().renderedColumns==={n}',timeout=10000); page.wait_for_timeout(60)
                transitions.append({'columns':n,'ms':round((time.perf_counter()-st)*1000,1)})
            shell=page.locator('#tu-ultrawide-deck-shell')
            for _ in range(16):
                shell.evaluate('(el)=>{el.scrollTop=el.scrollHeight}'); page.wait_for_timeout(25)
            page.wait_for_timeout(300)
            final=page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
            overlaps=page.evaluate('''()=>{let bad=0;for(const col of document.querySelectorAll('#tu-ultrawide-deck-grid>.tu-column')){const a=[...col.querySelectorAll(':scope>.tu-item')].map(e=>e.getBoundingClientRect()).sort((x,y)=>x.top-y.top);for(let i=1;i<a.length;i++)if(a[i-1].bottom>a[i].top-1)bad++}return bad}''')
            retained=page.locator('#tu-ultrawide-deck-grid .tu-item').count()
            return {'label':label,'version':version,'runtimeMs':round(runtime_ms,1),'ready200Ms':round(ready_ms,1),'retained':retained,'initialLongTasks':initial['longTaskCount'],'initialLongTaskMs':initial['longTaskMs'],'transitionLongTasks':final['longTaskCount']-before_count,'transitionLongTaskMs':final['longTaskMs']-before_ms,'transitions':transitions,'transitionAvgMs':round(sum(x['ms'] for x in transitions)/len(transitions),1),'transitionMaxMs':max(x['ms'] for x in transitions),'geometryViolations':final['geometryViolations'],'interactionFailures':final['interactionFailures'],'overlaps':overlaps,'errors':errors,'renderedColumns':final['renderedColumns']}
        finally: ctx.close()

def main():
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H); ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(CERTDIR/'cert.pem',CERTDIR/'key.pem'); srv.socket=ctx.wrap_socket(srv.socket,server_side=True); threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]
    browser=ensure_isolated_browser(); bd=browser_diagnostics()
    cases=[('v7.1.0',pathlib.Path('/tmp/ud-v71-ext'),'7.1.0'),('v7.2.0',ROOT/'dist-manual/chromium-mv3','7.2.0')]
    try:
        results=[run_case(*c,port,browser) for c in cases]
        base,new=results
        out={'browser':bd,'results':results,'improvement':{'ready200Pct':round((base['ready200Ms']-new['ready200Ms'])/base['ready200Ms']*100,1),'transitionAvgPct':round((base['transitionAvgMs']-new['transitionAvgMs'])/base['transitionAvgMs']*100,1),'transitionMaxPct':round((base['transitionMaxMs']-new['transitionMaxMs'])/base['transitionMaxMs']*100,1),'transitionLongTaskMsPct':round((base['transitionLongTaskMs']-new['transitionLongTaskMs'])/base['transitionLongTaskMs']*100,1) if base['transitionLongTaskMs'] else None}}
        print(json.dumps(out,indent=2)); (ROOT/'dist/UltraDeck-v7.2.0-performance-ab.json').write_text(json.dumps(out,indent=2)+'\n')
        for r in results: assert r['retained']==200 and r['geometryViolations']==0 and r['interactionFailures']==0 and r['overlaps']==0 and not r['errors'] and r['renderedColumns']==20
    finally: srv.shutdown(); srv.server_close()
if __name__=='__main__': main()
