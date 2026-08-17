from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,tempfile,threading,time,sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve();VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.5.0')
CERT=pathlib.Path(tempfile.mkdtemp(prefix='ud-v85-options-cert-'))
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'k'),'-out',str(CERT/'c'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def page_html():
    posts=''.join(f'<div data-e2e="recommend-list-item-container" data-video-id="{9000000000000000000+i}"><a href="/@tester/video/{9000000000000000000+i}">Video</a><div class="xgplayer-container" id="xgwrapper-0-{9000000000000000000+i}"><video></video></div><section class="x-SectionActionBarContainer"><button data-e2e="like-icon">Like</button></section></div>' for i in range(1,7))
    return f'<!doctype html><html><body><main data-e2e="recommend-list">{posts}</main></body></html>'.encode()
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        d=page_html();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(d)));self.end_headers();self.wfile.write(d)
    def log_message(self,*a):pass

def extension_id(profile:pathlib.Path):
    end=time.time()+10
    while time.time()<end:
        prefs=profile/'Default'/'Preferences'
        if prefs.is_file():
            try:
                data=json.loads(prefs.read_text())
                for k,v in data.get('extensions',{}).get('settings',{}).items():
                    try:
                        if pathlib.Path(v.get('path','')).resolve()==EXT.resolve(): return k
                    except Exception:pass
            except Exception:pass
        time.sleep(.05)
    raise RuntimeError('UltraDeck extension ID not found')

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'c',CERT/'k');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
    browser=ensure_isolated_browser();runtime=browser_diagnostics();profile=pathlib.Path(tempfile.mkdtemp(prefix='ud-v85-options-profile-'))
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox',f'--host-resolver-rules=MAP www.tiktok.com 127.0.0.1']
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(str(profile),executable_path=str(browser),headless=True,ignore_https_errors=True,args=args)
        try:
            seed=ctx.new_page();seed.goto(f'https://www.tiktok.com:{port}/foryou',wait_until='domcontentloaded',timeout=30000);seed.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}'",timeout=15000)
            eid=extension_id(profile);options=ctx.new_page();options.goto(f'chrome-extension://{eid}/options.html',wait_until='domcontentloaded',timeout=20000)
            options.wait_for_function("document.getElementById('save-state').textContent==='Saved'",timeout=5000)
            ids=['tumblr','patreon','x','tiktok'];assert all(options.locator(f'#site-{x}').is_checked() for x in ids)
            # Every site switch writes through real extension storage and persists across options reload.
            for sid in ids: options.locator(f'#site-{sid}').uncheck()
            options.wait_for_timeout(200)
            options.reload(wait_until='domcontentloaded');options.wait_for_function("document.getElementById('save-state').textContent==='Saved'",timeout=5000)
            assert all(not options.locator(f'#site-{x}').is_checked() for x in ids)
            # TikTok is disabled after the storage-driven tab reload: no UltraDeck runtime or shell is present.
            seed.wait_for_load_state('domcontentloaded');seed.wait_for_timeout(250)
            assert seed.evaluate("!window.__UltraDeck && !document.querySelector('#tu-ultrawide-deck-shell')")
            # Re-enable TikTok only. The bridge reloads the affected open tab and the page-world runtime boots.
            options.locator('#site-tiktok').check();options.wait_for_timeout(200)
            seed.wait_for_load_state('domcontentloaded');seed.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}'",timeout=15000)
            assert seed.evaluate("document.documentElement.dataset.tuSiteEnabled==='1' && !!document.querySelector('#tu-ultrawide-deck-shell')")
            # Restore all defaults and prove persistence again.
            for sid in ['tumblr','patreon','x']: options.locator(f'#site-{sid}').check()
            options.wait_for_timeout(200);options.reload(wait_until='domcontentloaded');options.wait_for_function("document.getElementById('save-state').textContent==='Saved'",timeout=5000)
            final={sid:options.locator(f'#site-{sid}').is_checked() for sid in ids}
            out={'browser':runtime,'extensionId':eid,'finalSites':final,'tiktokEnabled':seed.evaluate("document.documentElement.dataset.tuSiteEnabled"),'version':seed.evaluate('window.__UltraDeck?.version||null')};print(json.dumps(out,indent=2))
            assert all(final.values()) and out['tiktokEnabled']=='1' and out['version']==VERSION
            assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:
            ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
