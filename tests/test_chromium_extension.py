import http.server, socketserver, ssl, threading, tempfile, pathlib, time, json, io, sys, os
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR', str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.4.0')
CERTDIR=pathlib.Path(tempfile.mkdtemp(prefix='ud-cert-'))
import subprocess
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERTDIR/'key.pem'),'-out',str(CERTDIR/'cert.pem'),'-days','1','-subj','/CN=www.tumblr.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
IM={}
for w,h,c in [(48,30,(60,60,70)),(640,400,(35,160,225)),(1280,800,(25,190,135))]:
    im=Image.new('RGB',(w,h),c); b=io.BytesIO(); im.save(b,'PNG'); IM[str(w)]=b.getvalue()
COUNTS={}; LOCK=threading.Lock()
class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        path=self.path.split('?')[0]
        if path.startswith('/img/'):
            size=path.rsplit('/',1)[-1].split('.')[0]; data=IM.get(size,IM['640'])
            with LOCK: COUNTS[path]=COUNTS.get(path,0)+1
            if size!='48': time.sleep(.035)
            self.send_response(200); self.send_header('Content-Type','image/png'); self.send_header('Cache-Control','public,max-age=3600,immutable'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        posts=[]; elements=[]
        for i in range(1,37):
            posts.append(f'<div tabindex="-1" data-id="{i}"><article><figure><img style="filter:blur(18px);opacity:.08" width="520" height="325" src="/img/{i}/48.png"></figure><button data-testid="like">Like</button><p>Post {i}</p></article></div>')
            elements.append({'id':str(i),'content':[{'type':'image','media':[{'url':f'https://www.tumblr.com:{self.server.server_address[1]}/img/{i}/1280.png','type':'image/png','width':1280,'height':800},{'url':f'https://www.tumblr.com:{self.server.server_address[1]}/img/{i}/640.png','type':'image/png','width':640,'height':400}]}]})
        payload={'response':{'timeline':{'elements':elements}}}
        html=f'''<!doctype html><html><head><meta charset="utf-8"><title>Tumblr test</title></head><body><nav><a href="/dashboard">Home</a><a href="/explore">Explore</a></nav><main data-timeline="/api/v2/timeline/dashboard">{''.join(posts)}</main><aside><h2>Radar</h2></aside><script>window.tumblr={{getCssMap:async()=>({{}}),on:()=>true,apiFetch:(r,i)=>Promise.resolve({json.dumps(payload)})}};setTimeout(()=>window.tumblr.apiFetch('/api/v2/timeline/dashboard'),20);</script></body></html>'''
        data=html.encode(); self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self,*a): pass

def extension_id(profile:pathlib.Path):
    local=profile/'Default'/'Local Extension Settings'
    end=time.time()+10
    while time.time()<end:
        if local.is_dir():
            ids=[p.name for p in local.iterdir() if p.is_dir()]
            if ids: return ids[0]
        time.sleep(.05)
    prefs=profile/'Default'/'Preferences'
    if prefs.is_file():
        data=json.loads(prefs.read_text())
        for k,v in data.get('extensions',{}).get('settings',{}).items():
            if pathlib.Path(v.get('path','')).resolve()==EXT.resolve(): return k
    raise RuntimeError('UltraDeck extension ID not found')

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True; srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H); ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(CERTDIR/'cert.pem',CERTDIR/'key.pem'); srv.socket=ctx.wrap_socket(srv.socket,server_side=True); threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]
    profile=pathlib.Path(tempfile.mkdtemp(prefix='ud-browser-lab-')); browser=ensure_isolated_browser(); runtime=browser_diagnostics(); errors=[]
    try:
        with sync_playwright() as pw:
            bc=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':1920,'height':1080},args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tumblr.com 127.0.0.1'])
            try:
                page=bc.new_page(); page.on('pageerror',lambda e:errors.append('pageerror: '+str(e))); page.on('console',lambda m: errors.append('console: '+m.text) if m.type=='error' else None)
                response=page.goto(f'https://www.tumblr.com:{port}/dashboard/stuff_for_you',wait_until='domcontentloaded',timeout=60000); assert response and response.status==200
                page.wait_for_function(f"window.__TumblrUltraWideDeck?.version==='{VERSION}'",timeout=20000)
                page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().cachedPosts>=36",timeout=30000)
                page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().mediaQualityReady>=36",timeout=30000)
                before=page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
                page.evaluate("document.dispatchEvent(new CustomEvent('ultradeck:command',{detail:JSON.stringify({type:'setColumns',value:12,requestId:'t1'})}));")
                page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===12",timeout=10000)
                page.evaluate("document.dispatchEvent(new CustomEvent('ultradeck:command',{detail:JSON.stringify({type:'setSettings',value:{layoutMode:'rows',minCardHeight:300,mediaOnly:true,gap:9},requestId:'tq'})}));")
                page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().layoutMode==='rows' && window.__TumblrUltraWideDeck.diagnostics().minCardHeight===300",timeout=10000)
                # Force extension storage creation, then exercise the actual popup against the active Tumblr tab.
                page.wait_for_timeout(300); eid=extension_id(profile)
                popup=bc.new_page(); popup_errors=[]; popup.on('pageerror',lambda e:popup_errors.append('pageerror: '+str(e))); popup.on('console',lambda m: popup_errors.append('console: '+m.text) if m.type=='error' else None)
                popup.goto(f'chrome-extension://{eid}/popup.html',wait_until='domcontentloaded',timeout=30000); page.bring_to_front(); popup.wait_for_timeout(300)
                popup.locator('#columns').select_option('8'); popup.locator('#columns').dispatch_event('change'); page.wait_for_function("window.__TumblrUltraWideDeck.diagnostics().renderedColumns===8",timeout=10000)
                popup.locator('#nav').click(); page.wait_for_function("getComputedStyle(document.querySelector('nav')).display==='none'",timeout=5000)
                popup.locator('#extras').click(); page.wait_for_function("getComputedStyle(document.querySelector('aside')).display==='none'",timeout=5000)
                page.bring_to_front(); after=page.evaluate('window.__TumblrUltraWideDeck.diagnostics()')
                with LOCK: duplicates={k:v for k,v in COUNTS.items() if v>1 and '/48.png' not in k}
                out={'browser':runtime,'extensionId':eid,'loadedVersion':after['version'],'beforeColumns':before['renderedColumns'],'afterColumns':after['renderedColumns'],'posts':after['cachedPosts'],'ready':after['mediaQualityReady'],'pending':after['mediaPending'],'blur':page.evaluate("[...document.querySelectorAll('#tu-ultrawide-deck-grid img')].filter(x=>/blur\\(/.test(getComputedStyle(x).filter)||Number(getComputedStyle(x).opacity)<.15).length"),'navHidden':page.evaluate("getComputedStyle(document.querySelector('nav')).display==='none'"),'extrasHidden':page.evaluate("getComputedStyle(document.querySelector('aside')).display==='none'"),'duplicates':duplicates,'interactionFailures':after['interactionFailures'],'geometryViolations':after['geometryViolations'],'layoutMode':after['layoutMode'],'minCardHeight':after['minCardHeight'],'mediaOnly':after['mediaOnly'],'pageErrors':errors,'popupErrors':popup_errors}
                print(json.dumps(out,indent=2)); assert runtime['policyIsolated'] and not runtime['hostPoliciesModified'] and out['loadedVersion']==VERSION and out['afterColumns']==8 and out['posts']>=36 and out['ready']>=36 and out['pending']==0 and out['blur']==0 and out['navHidden'] and out['extrasHidden'] and not duplicates and out['interactionFailures']==0 and out['geometryViolations']==0 and out['layoutMode']=='rows' and out['minCardHeight']==300 and out['mediaOnly'] and not errors and not popup_errors
            finally: bc.close()
    finally:
        srv.shutdown(); srv.server_close()
if __name__=='__main__': main()
