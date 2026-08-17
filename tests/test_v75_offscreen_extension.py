import http.server, socketserver, ssl, threading, tempfile, pathlib, time, json, sys, os, subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.4.0')
FIXTURE=(ROOT/'tests/fixtures/tumblr_fixture.html').read_text()
FIXTURE=FIXTURE.replace(
    '<div class="postbody"><label>Comment <input data-testid="comment-input" value=""></label></div>',
    '<div class="postbody"><label>Comment <input data-testid="comment-input" value=""></label>'
    '<label> Flag <input data-testid="flag-input" type="checkbox"></label>'
    '<select data-testid="choice-input"><option value="a">A</option><option value="b">B</option></select>'
    '<div data-testid="rich-input" contenteditable="true">editable</div></div>'
)
CERTDIR=pathlib.Path(tempfile.mkdtemp(prefix='ud75-int-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERTDIR/'key.pem'),'-out',str(CERTDIR/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def handle(self):
        try: super().handle()
        except (BrokenPipeError,ConnectionResetError,ssl.SSLError,OSError): pass
    def safe_write(self,data):
        try: self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError,ssl.SSLError,OSError): pass
    def do_GET(self):
        if self.path.startswith('/img/'):
            data=b'<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"><rect width="520" height="300" fill="#345"/></svg>'
            self.send_response(200); self.send_header('Content-Type','image/svg+xml'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.safe_write(data); return
        data=FIXTURE.encode()
        self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.safe_write(data)
    def log_message(self,*a): pass

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H)
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(CERTDIR/'cert.pem',CERTDIR/'key.pem'); srv.socket=ctx.wrap_socket(srv.socket,server_side=True)
    threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]
    profile=pathlib.Path(tempfile.mkdtemp(prefix='ud75-int-browser-')); browser=ensure_isolated_browser(); bdiag=browser_diagnostics(); errors=[]
    try:
      with sync_playwright() as pw:
        bc=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':3440,'height':1200},args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
        try:
          page=bc.new_page(); page.on('pageerror',lambda e:errors.append('pageerror: '+str(e))); page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
          r=page.goto(f'https://www.tumblr.com:{port}/dashboard/stuff_for_you',wait_until='domcontentloaded',timeout=60000); assert r and r.status==200
          page.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{VERSION}'",timeout=20000)
          page.evaluate("()=>window.__TumblrUltraWideDeck.buffer(80)")
          page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=80 && window.__TumblrUltraWideDeck.diagnostics().postBuildQueued===0",timeout=45000)
          # Park Tumblr's hidden native virtualizer far from post 1, but keep the visible UltraDeck
          # viewport away from its own bottom-buffer trigger so interaction measurements are not
          # contaminated by unrelated feed growth.
          page.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)")
          page.wait_for_timeout(300)
          page.wait_for_function("!window.__TumblrUltraWideDeck.sourceMounted('1') && window.__TumblrUltraWideDeck.diagnostics().postBuildQueued===0",timeout=10000)
          page.evaluate("const s=document.querySelector('#tu-ultrawide-deck-shell');s.scrollTop=Math.max(0,(s.scrollHeight-s.clientHeight)*0.68)")
          page.wait_for_timeout(250)
          setup=page.evaluate("""()=>{const s=document.querySelector('#tu-ultrawide-deck-shell'),m=document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"1\"]');const sr=s.getBoundingClientRect(),mr=m.getBoundingClientRect();const vis=[...document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>sr.top&&r.top<sr.bottom}).map(e=>({id:e.dataset.tuItem,top:e.getBoundingClientRect().top}));return {cached:__TumblrUltraWideDeck.diagnostics().cachedPosts,source1:__TumblrUltraWideDeck.sourceMounted('1'),offscreen:mr.bottom<sr.top||mr.top>sr.bottom,scrollTop:s.scrollTop,anchor:vis[0]||null}}""")
          assert setup['cached']>=80 and not setup['source1'] and setup['offscreen'], setup
          # Direct mirror click while the mirror and its native source are both outside their viewports.
          before=page.evaluate("fixture.events.filter(e=>e[0]==='like'&&e[1]==='1').length")
          t=time.perf_counter(); page.evaluate("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"1\"] [data-testid=like]').click()")
          page.wait_for_function(f"fixture.events.filter(e=>e[0]==='like'&&e[1]==='1').length==={before+1}",timeout=5000); like_ms=(time.perf_counter()-t)*1000
          page.wait_for_function("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"1\"] [data-testid=like]')?.getAttribute('aria-pressed')==='true'",timeout=3000)
          # Programmatic retained-post routing is exact and does not require making the mirror visible.
          actions=[]
          for pid,action,event in [('17','menu','menu'),('33','expand','expand'),('49','poll','poll')]:
            assert not page.evaluate(f"__TumblrUltraWideDeck.sourceMounted('{pid}')")
            t=time.perf_counter(); res=page.evaluate("([id,a])=>window.__TumblrUltraWideDeck.interact(id,a)",[pid,action]); elapsed=(time.perf_counter()-t)*1000
            assert res['ok'],res
            page.wait_for_function(f"fixture.events.some(e=>e[0]==='{event}'&&e[1]==='{pid}')",timeout=5000)
            actions.append({'id':pid,'action':action,'ms':round(elapsed,1)})
          page.wait_for_function("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"33\"] [data-extra]')?.hidden===false",timeout=3000)
          page.wait_for_function("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"49\"] [data-testid=poll-answer]')?.textContent==='Selected'",timeout=3000)
          assert not page.evaluate("__TumblrUltraWideDeck.sourceMounted('65')")
          inp=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('65','input',{value:'offscreen-v75'})")
          assert inp['ok'] and inp.get('value')=='offscreen-v75',inp
          page.wait_for_function("fixture.events.some(e=>e[0]==='input'&&e[1]==='65'&&e[2]==='offscreen-v75')",timeout=5000)
          # Generic retained-form routing covers controls that are not built-in aliases too.
          assert not page.evaluate("__TumblrUltraWideDeck.sourceMounted('81')")
          controls=page.evaluate("()=>window.__TumblrUltraWideDeck.controls('81')"); assert any(c.get('testid')=='flag-input' for c in controls),controls
          checked=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('81','flag',{checked:true})")
          assert checked['ok'] and checked.get('checked') is True,checked
          assert page.evaluate("document.querySelector('#tu-ultrawide-deck-grid [data-tu-mirror-post=\"81\"] [data-testid=flag-input]').checked")
          choice=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('97','choice',{value:'b'})")
          assert choice['ok'] and choice.get('value')=='b',choice
          page.wait_for_function("fixture.events.some(e=>e[0]==='input'&&e[1]==='97'&&e[2]==='b')",timeout=5000)
          rich=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('113','rich',{text:'offscreen rich edit'})")
          assert rich['ok'] and rich.get('text')=='offscreen rich edit',rich
          # After feedback seeking has observed real virtualizer waves, a later far action reuses
          # the learned route-local geometry instead of starting from scratch.
          assert not page.evaluate("__TumblrUltraWideDeck.sourceMounted('129')")
          t=time.perf_counter(); learned=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('129','menu')"); learned_ms=(time.perf_counter()-t)*1000
          assert learned['ok'],learned
          page.wait_for_function("fixture.events.some(e=>e[0]==='menu'&&e[1]==='129')",timeout=5000)
          actions.append({'id':'129','action':'menu-learned','ms':round(learned_ms,1)})
          # Different retained posts share one hidden Tumblr virtualizer. Fire three far native-backed
          # actions concurrently and require UltraDeck to transact them without cross-post races.
          page.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)")
          page.wait_for_timeout(220)
          concurrent_ids=['1','33','49']
          assert all(not page.evaluate(f"__TumblrUltraWideDeck.sourceMounted('{pid}')") for pid in concurrent_ids), concurrent_ids
          before_concurrent={pid:page.evaluate(f"fixture.events.filter(e=>e[0]==='menu'&&e[1]==='{pid}').length") for pid in concurrent_ids}
          t=time.perf_counter()
          concurrent=page.evaluate("async(ids)=>Promise.all(ids.map((id)=>window.__TumblrUltraWideDeck.interact(id,'menu')))",concurrent_ids)
          concurrent_ms=(time.perf_counter()-t)*1000
          assert all(result.get('ok') for result in concurrent),concurrent
          for pid in concurrent_ids:
              page.wait_for_function(f"fixture.events.filter(e=>e[0]==='menu'&&e[1]==='{pid}').length==={before_concurrent[pid]+1}",timeout=5000)
          # The visible deck anchor remains visually fixed while background native virtualization teleports.
          after_anchor=page.evaluate("""()=>{const s=document.querySelector('#tu-ultrawide-deck-shell'),sr=s.getBoundingClientRect(),vis=[...document.querySelectorAll('#tu-ultrawide-deck-grid .tu-item')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>sr.top&&r.top<sr.bottom}).map(e=>({id:e.dataset.tuItem,top:e.getBoundingClientRect().top}));return vis[0]||null}""")
          assert setup['anchor'] and after_anchor and setup['anchor']['id']==after_anchor['id'] and abs(setup['anchor']['top']-after_anchor['top'])<3,(setup['anchor'],after_anchor)
          diag=page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
          pre_link={'cached':diag['cachedPosts'],'failures':diag['interactionFailures'],'restores':diag['interactionRestores'],'mounts':diag['interactionMountSuccesses'],'programmatic':diag['interactionProgrammaticActions'],'stage':diag['actionStageActive'],'nativeActions':diag['nativeActions'],'nativeInputs':diag['nativeInputSyncs'],'seekProbes':diag['interactionSeekProbes'],'seekSamples':diag['virtualizerSeekSamples'],'modelPredictions':diag['virtualizerModelPredictions'],'txReads':diag['interactionTransactionReads'],'txWrites':diag['interactionTransactionWrites'],'txQueued':diag['interactionTransactionQueued'],'txMaxQueue':diag['interactionTransactionMaxQueue'],'txMaxWaitMs':diag['interactionTransactionMaxWaitMs']}
          assert pre_link['cached']>=136 and pre_link['failures']==0 and pre_link['restores']>=9 and pre_link['mounts']>=9 and pre_link['programmatic']>=11 and not pre_link['stage'] and pre_link['nativeActions']>=8 and pre_link['nativeInputs']>=4 and pre_link['seekSamples']>=2 and pre_link['modelPredictions']>=1 and pre_link['txWrites']>=3 and pre_link['txMaxQueue']>=2,pre_link
          assert page.locator('[data-tu-live-source="1"]').count()==0
          # Link is also native-backed from an unmounted retained post. Run last because the fixture changes route.
          assert not page.evaluate("__TumblrUltraWideDeck.sourceMounted('73')")
          link=page.evaluate("()=>window.__TumblrUltraWideDeck.interact('73','permalink')"); assert link['ok'],link
          page.wait_for_function("location.pathname==='/post/73' && fixture.events.some(e=>e[0]==='route'&&e[1]==='73')",timeout=5000)
          out={'browser':bdiag,'version':VERSION,'setup':setup,'likeMs':round(like_ms,1),'actions':actions,'input':inp,'semantic':{'controls':controls,'flag':checked,'choice':choice,'rich':rich},'concurrent':{'ids':concurrent_ids,'ms':round(concurrent_ms,1),'results':concurrent},'preLink':pre_link,'afterAnchor':after_anchor,'route':page.evaluate('location.pathname'),'errors':errors}
          print(json.dumps(out,indent=2))
          assert bdiag['policyIsolated'] and not bdiag['hostPoliciesModified'] and not errors
        finally: bc.close()
    finally: srv.shutdown(); srv.server_close()
if __name__=='__main__': main()
