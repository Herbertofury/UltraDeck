from __future__ import annotations
import http.server,json,os,pathlib,socketserver,ssl,subprocess,tempfile,threading,sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from policy_isolated_browser import ensure_isolated_browser, diagnostics as browser_diagnostics
EXT=pathlib.Path(os.environ.get('ULTRADECK_EXTENSION_DIR',str(ROOT/'dist-manual/chromium-mv3'))).resolve()
VERSION=os.environ.get('ULTRADECK_EXPECT_VERSION','8.5.0')
TMP=pathlib.Path(tempfile.mkdtemp(prefix='ud-v85-tiktok-'))
CERT=TMP/'cert';CERT.mkdir()
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(CERT/'key.pem'),'-out',str(CERT/'cert.pem'),'-days','1','-subj','/CN=ultradeck.test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
MEDIA=TMP/'sample.webm'
subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c=black:s=48x48:d=0.5','-an','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-y',str(MEDIA)],check=True)

def posts(count=16):
    out=[]
    for i in range(1,count+1):
        vid=7300000000000000000+i
        out.append(f'''<div data-e2e="recommend-list-item-container" data-video-id="{vid}">
          <a class="permalink" href="/@tester/video/{vid}">Video {i}</a>
          <div class="xgplayer-container" id="xgwrapper-0-{vid}"><video muted playsinline src="/media/sample.webm"></video><div class="player-message"></div></div>
          <section class="x-SectionActionBarContainer">
            <button data-action="like" data-e2e="like-icon" aria-label="Like">Like</button>
            <button data-action="repost" data-e2e="repost-icon" aria-label="Repost">Repost</button>
            <button data-action="comment" data-e2e="comment-icon" aria-label="Comment">Comment</button>
            <button data-action="share" data-e2e="share-icon" aria-label="Share">Share</button>
          </section><p>Body {i}</p>
        </div>''')
    return ''.join(out)

def page_html():
    body=posts()
    js='''<script>(()=>{window.fixture={events:[],playbackRetries:0};document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.closest('#tu-ultrawide-deck-shell'))return;const post=b.closest('[data-video-id]');fixture.events.push({id:post?.getAttribute('data-video-id')||'',action:b.dataset.action||''});if(b.dataset.action==='retry'){fixture.playbackRetries++;const msg=post?.querySelector('.player-message');if(msg)msg.textContent='';}},true);})();</script>'''
    return f'<!doctype html><html><head><meta charset="utf-8"><title>TikTok</title></head><body><nav role="navigation"><a href="/foryou">For You</a><a href="/following">Following</a></nav><main data-e2e="recommend-list">{body}</main>{js}</body></html>'.encode()

class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def do_GET(self):
        if self.path.startswith('/media/sample.webm'):
            data=MEDIA.read_bytes(); self.send_response(200); self.send_header('Content-Type','video/webm'); self.send_header('Accept-Ranges','bytes'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        data=page_html();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*a): pass

def main():
    socketserver.ThreadingTCPServer.daemon_threads=True
    srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),H);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(CERT/'cert.pem',CERT/'key.pem');srv.socket=tls.wrap_socket(srv.socket,server_side=True);threading.Thread(target=srv.serve_forever,daemon=True).start();port=srv.server_address[1]
    browser=ensure_isolated_browser();runtime=browser_diagnostics();profile=tempfile.mkdtemp(prefix='ud-v85-tiktok-profile-')
    args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',f'--host-resolver-rules=MAP www.tiktok.com 127.0.0.1']
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(profile,executable_path=str(browser),headless=True,ignore_https_errors=True,viewport={'width':2560,'height':1080},args=args)
        try:
            p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append('pageerror:'+str(e)));p.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
            r=p.goto(f'https://www.tiktok.com:{port}/foryou',wait_until='domcontentloaded',timeout=30000);assert r and r.status==200
            p.wait_for_function(f"window.__UltraDeck?.version==='{VERSION}' && window.__UltraDeck.diagnostics().site==='tiktok'",timeout=15000)
            p.wait_for_function("window.__UltraDeck.diagnostics().cachedPosts===16",timeout=20000)
            p.evaluate("window.__UltraDeck.setColumns(8)");p.wait_for_function("window.__UltraDeck.diagnostics().renderedColumns===8",timeout=10000)
            first='7300000000000000001'
            for action in ['like','repost','comment','share']:
                result=p.evaluate(f"window.__UltraDeck.interact('{first}','{action}')");assert result.get('ok'),(action,result)
            p.wait_for_function("window.fixture.events.filter(x=>x.id==='7300000000000000001').length>=4",timeout=8000)
            # Retained TikTok video cards get a direct playable source instead of a metadata-only inert clone.
            p.wait_for_function("document.querySelectorAll('#tu-ultrawide-deck-shell video[data-tu-retained-video-playable=\"1\"]').length===16",timeout=10000)
            mirror=p.evaluate("""()=>{const v=document.querySelector('#tu-ultrawide-deck-shell video');return {controls:v?.controls,src:v?.getAttribute('src')||'',state:v?.dataset.tuRetainedVideoState||''}}""")
            assert mirror['controls'] and mirror['state']=='direct' and '/media/sample.webm' in mirror['src'],mirror
            # Simulate TikTok's visible player error UI. Recovery must choose the native Retry control first.
            p.evaluate("""()=>{const post=document.querySelector('[data-video-id="7300000000000000002"]');post.querySelector('.player-message').textContent='Ran into an error. Cannot play this video.';const retry=document.createElement('button');retry.dataset.action='retry';retry.dataset.e2e='retry-button';retry.textContent='Try again';post.querySelector('.xgplayer-container').appendChild(retry);document.querySelector('[data-tu-mirror-post=\"7300000000000000002\"] video').dispatchEvent(new Event('error',{bubbles:false}));}""")
            p.wait_for_function("window.fixture.playbackRetries===1",timeout=5000)
            p.wait_for_function("window.__UltraDeck.diagnostics().tiktokPlaybackNativeRetryClicks>=1",timeout=5000)
            p.wait_for_function("window.__UltraDeck.diagnostics().tiktokPlaybackRecoverySuccesses>=1",timeout=5000)
            d=p.evaluate("window.__UltraDeck.diagnostics()")
            out={'browser':runtime,'cached':d['cachedPosts'],'columns':d['renderedColumns'],'video':mirror,'playback':{k:v for k,v in d.items() if k.startswith('tiktokPlayback')},'events':p.evaluate('window.fixture.events'),'geometry':d['geometryViolations'],'interactions':d['interactionFailures'],'errors':errors}
            print(json.dumps(out,indent=2))
            assert d['retainedVideoPlayableCurrent']==16 and d['retainedVideoPlayable']>=16 and d['retainedVideoDirectSources']>=16 and d['retainedVideoBlobFallbacks']==0,d
            assert d['tiktokPlaybackRecoveryInstalled'] is True and d['tiktokPlaybackMirrorVideosObserved']>=16 and d['tiktokPlaybackErrors']>=1 and d['tiktokPlaybackMirrorRecoveries']>=1 and d['tiktokPlaybackNativeRetryClicks']>=1 and d['tiktokPlaybackRecoverySuccesses']>=1,d
            assert d['geometryViolations']==0 and d['interactionFailures']==0 and not errors,(d,errors)
            assert runtime['policyIsolated'] and not runtime['hostPoliciesModified']
        finally:
            ctx.close();srv.shutdown();srv.server_close()
if __name__=='__main__':main()
