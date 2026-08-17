from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'shared-runtime-source/build_runtime.py')], check=True)
VERSION = '8.5.0'
DESC = 'Lossless multi-column retained feeds for Tumblr, Patreon, X, and TikTok with native-backed interactions and TikTok playback recovery.'
HOSTS = [
    'https://www.tumblr.com/*', 'https://www.patreon.com/*',
    'https://x.com/*', 'https://twitter.com/*',
    'https://www.tiktok.com/*', 'https://tiktok.com/*', 'https://*.tiktok.com/*',
]
SITE_SCRIPTS = [
    (['https://www.tumblr.com/*'], 'site-tumblr.js'),
    (['https://www.patreon.com/*'], 'site-patreon.js'),
    (['https://x.com/*', 'https://twitter.com/*'], 'site-x.js'),
    (['https://www.tiktok.com/*', 'https://tiktok.com/*', 'https://*.tiktok.com/*'], 'site-tiktok.js'),
]

css = (ROOT / 'entrypoints/popup/style.css').read_text(encoding='utf-8')
html = (ROOT / 'entrypoints/popup/index.html').read_text(encoding='utf-8').replace(
    '<script type="module" src="./main.ts"></script>', '<script src="popup.js"></script>'
).replace('</head>', '<link rel="stylesheet" href="popup.css"></head>')
options_html = (ROOT / 'public/options.html').read_text(encoding='utf-8')
options_css = (ROOT / 'public/options.css').read_text(encoding='utf-8')
options_js = (ROOT / 'public/options.js').read_text(encoding='utf-8')

bridge = r"""(()=>{'use strict';
const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,COMMAND='ultradeck:command',STATE='ultradeck:state',GATE='ultradeck:site-gate',KEY='ultradeckSettings',SITE_KEY='ultradeckSites',DEFAULTS={tumblr:true,patreon:true,x:true,tiktok:true};let seq=0,enabled=true,ready=false;
const site=(()=>{const h=location.hostname.toLowerCase().replace(/^www\./,'');if(h==='tumblr.com')return'tumblr';if(h==='patreon.com')return'patreon';if(h==='x.com'||h==='twitter.com')return'x';if(h==='tiktok.com'||h.endsWith('.tiktok.com'))return'tiktok';return null;})();
const norm=v=>{const o={...DEFAULTS};if(v&&typeof v==='object')for(const k of Object.keys(DEFAULTS))if(typeof v[k]==='boolean')o[k]=v[k];return o};
function publish(next){enabled=next;ready=true;const root=document.documentElement;if(root){root.dataset.tuSiteEnabled=next?'1':'0';root.dataset.tuSiteId=site||'unknown'}document.dispatchEvent(new CustomEvent(GATE,{detail:JSON.stringify({site,enabled:next})}));}
function cmd(type,value,timeout=2500){if(ready&&!enabled)return Promise.reject(new Error(`UltraDeck is disabled on ${site||'this site'}.`));const requestId=`ext-${Date.now()}-${++seq}`;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{document.removeEventListener(STATE,on,true);reject(new Error(`UltraDeck page bridge timed out: ${type}`));},timeout);function on(e){let p;try{p=JSON.parse(String(e.detail||'{}'))}catch{return}if(p.requestId!==requestId)return;clearTimeout(t);document.removeEventListener(STATE,on,true);resolve(p)}document.addEventListener(STATE,on,true);document.dispatchEvent(new CustomEvent(COMMAND,{detail:JSON.stringify({type,value,requestId})}))})}
document.addEventListener(STATE,e=>{try{const p=JSON.parse(String(e.detail||'{}'));if(p.settings)void ext.storage.local.set({[KEY]:p.settings})}catch{}},true);
ext.runtime.onMessage.addListener((m,_s,send)=>{if(!m||typeof m.type!=='string')return;if(ready&&!enabled){send({ok:false,disabled:true,site,error:`UltraDeck is disabled on ${site||'this site'}.`});return}cmd(m.type,m.value).then(payload=>send({ok:true,payload})).catch(error=>send({ok:false,error:error.message}));return true});
ext.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!site||!changes[SITE_KEY])return;const next=norm(changes[SITE_KEY].newValue)[site];if(!ready){publish(next);return}if(next===enabled)return;publish(next);location.reload()});
void Promise.resolve(ext.storage.local.get(SITE_KEY)).then(v=>{const prefs=norm(v?.[SITE_KEY]);publish(site?prefs[site]:false);if(!enabled)return;return Promise.resolve(ext.storage.local.get(KEY)).then(settings=>{if(settings?.[KEY])return cmd('setSettings',settings[KEY],5000)})}).catch(()=>publish(true));
})();"""

popup = r"""(()=>{'use strict';
const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,$=id=>document.getElementById(id),status=$('status'),hint=$('hint'),diag=$('diag'),columns=$('columns'),SITE_KEY='ultradeckSites',DEFAULTS={tumblr:true,patreon:true,x:true,tiktok:true};for(let i=1;i<=20;i++)columns.append(new Option(String(i),String(i)));let state=null,sites={...DEFAULTS},activeSite=null,timer=0;
const norm=v=>{const o={...DEFAULTS};if(v&&typeof v==='object')for(const k of Object.keys(DEFAULTS))if(typeof v[k]==='boolean')o[k]=v[k];return o};
const siteFor=url=>{try{const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');if(h==='tumblr.com')return'tumblr';if(h==='patreon.com')return'patreon';if(h==='x.com'||h==='twitter.com')return'x';if(h==='tiktok.com'||h.endsWith('.tiktok.com'))return'tiktok'}catch{}return null};
const controls=on=>document.querySelectorAll('.deck-controls').forEach(s=>{s.classList.toggle('disabled',!on);s.querySelectorAll('input,select,button').forEach(c=>c.disabled=!on)});
const drawSites=()=>Object.keys(DEFAULTS).forEach(id=>{$(`site-${id}`).checked=sites[id]});
async function tab(){return(await Promise.resolve(ext.tabs.query({active:true,currentWindow:true})))[0]}
async function command(type,value){if(activeSite&&!sites[activeSite])throw new Error(`UltraDeck is disabled on ${activeSite}.`);const t=await tab();if(!t?.id)throw new Error('No active tab');const r=await Promise.resolve(ext.tabs.sendMessage(t.id,{type,value}));if(!r?.ok)throw new Error(r?.error||'UltraDeck bridge unavailable');state=r.payload||null;render();return state}
function render(){const d=state?.diagnostics||{},s=state?.settings||{},site=String(state?.siteLabel||d.siteLabel||state?.site||d.site||activeSite||'site');$('version').textContent=state?.version?`v${state.version}`:'v8.5.0';$('posts').textContent=String(d.cachedPosts??d.posts??0);$('cols').textContent=String(d.renderedColumns??d.columns??0);$('media').textContent=String(d.mediaQualityReady??d.media?.qualityReady??0);columns.value=String(s.columns??'auto');$('layout').value=String(s.layoutMode??'masonry');$('mediaOnly').checked=Boolean(s.mediaOnly??false);$('turbo').checked=Boolean(s.turboMedia??true);$('minWidth').value=String(s.minCardWidth??320);$('minWidthOut').textContent=`${s.minCardWidth??320}px`;$('minHeight').value=String(s.minCardHeight??0);$('minHeightOut').textContent=Number(s.minCardHeight??0)?`${s.minCardHeight}px`:'Natural';$('gap').value=String(s.gap??16);$('gapOut').textContent=`${s.gap??16}px`;diag.textContent=JSON.stringify(d,null,2);status.textContent=`Live · ${site}`;status.classList.add('ok');status.classList.remove('disabled-status');hint.textContent=`Settings are synchronized with ${site} and extension storage.`;controls(true)}
function disabled(site){state=null;$('posts').textContent='0';$('cols').textContent='0';$('media').textContent='0';diag.textContent='{}';status.textContent=`Disabled · ${site==='x'?'X':site[0].toUpperCase()+site.slice(1)}`;status.classList.remove('ok');status.classList.add('disabled-status');hint.textContent='Enable this site above to reload the active tab with UltraDeck.';controls(false)}
function fail(e){status.textContent=activeSite?'Not connected':'Unsupported tab';status.classList.remove('ok','disabled-status');hint.textContent=e?.message||String(e);controls(Boolean(activeSite&&sites[activeSite]))}
function bind(id,type){$(id).addEventListener('click',()=>command(type).catch(fail))}
columns.addEventListener('change',()=>command('setColumns',columns.value==='auto'?'auto':Number(columns.value)).catch(fail));$('layout').addEventListener('change',e=>command('setSettings',{layoutMode:e.currentTarget.value}).catch(fail));$('mediaOnly').addEventListener('change',e=>command('setSettings',{mediaOnly:e.currentTarget.checked}).catch(fail));$('turbo').addEventListener('change',e=>command('setSettings',{turboMedia:e.currentTarget.checked}).catch(fail));for(const id of ['minWidth','minHeight','gap'])$(id).addEventListener('input',()=>{if(timer)clearTimeout(timer);const input=$(id);$(id+'Out').textContent=id==='minHeight'&&Number(input.value)===0?'Natural':`${input.value}px`;const payload=id==='minWidth'?{minCardWidth:Number(input.value)}:id==='minHeight'?{minCardHeight:Number(input.value)}:{gap:Number(input.value)};timer=setTimeout(()=>command('setSettings',payload).catch(fail),100)});for(const id of Object.keys(DEFAULTS))$(`site-${id}`).addEventListener('change',async e=>{sites={...sites,[id]:e.currentTarget.checked};await Promise.resolve(ext.storage.local.set({[SITE_KEY]:sites}));if(activeSite===id){if(sites[id]){status.textContent='Reloading';hint.textContent='UltraDeck is enabling on this tab…';controls(false)}else disabled(id)}});$('openOptions').addEventListener('click',()=>void ext.runtime.openOptionsPage());bind('nav','toggleNav');bind('extras','toggleExtras');bind('focus','toggleFocus');bind('sync','syncMedia');bind('rebalance','rebalance');bind('rescan','rescan');
void Promise.all([Promise.resolve(ext.storage.local.get(SITE_KEY)),tab()]).then(([stored,t])=>{sites=norm(stored?.[SITE_KEY]);drawSites();activeSite=siteFor(t?.url);if(!activeSite)throw new Error('Open Tumblr, Patreon, X, or TikTok in the active tab.');if(!sites[activeSite]){disabled(activeSite);return}return command('getState')}).catch(fail);
})();"""

for browser in ('chromium', 'firefox'):
    out = ROOT / 'dist-manual' / f'{browser}-mv3'
    if out.exists():
        for stale in out.glob('site-*.js'):
            stale.unlink()
    out.mkdir(parents=True, exist_ok=True)
    for _matches, adapter in SITE_SCRIPTS:
        site_name = adapter.removeprefix('site-').removesuffix('.js')
        shutil.copyfile(ROOT / 'src/adapters' / f'{site_name}.js', out / adapter)
    content_scripts = [
        {'matches': HOSTS, 'js': ['bridge.js'], 'run_at': 'document_start', 'world': 'ISOLATED'},
    ]
    for matches, adapter in SITE_SCRIPTS:
        content_scripts.append({'matches': matches, 'js': [adapter, 'runtime-main.js'], 'run_at': 'document_start', 'world': 'MAIN'})
    manifest = {
        'manifest_version': 3, 'name': 'UltraDeck', 'version': VERSION, 'description': DESC,
        'permissions': ['storage', 'activeTab'], 'host_permissions': HOSTS,
        'action': {'default_popup': 'popup.html', 'default_title': 'UltraDeck'},
        'options_ui': {'page': 'options.html', 'open_in_tab': True},
        'content_scripts': content_scripts,
    }
    if browser == 'firefox':
        manifest['browser_specific_settings'] = {'gecko': {'id': 'ultradeck-tumblr@bert.local', 'strict_min_version': '128.0'}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (out / 'bridge.js').write_text(bridge + '\n', encoding='utf-8')
    (out / 'popup.html').write_text(html, encoding='utf-8')
    (out / 'popup.css').write_text(css, encoding='utf-8')
    (out / 'popup.js').write_text(popup + '\n', encoding='utf-8')
    (out / 'options.html').write_text(options_html, encoding='utf-8')
    (out / 'options.css').write_text(options_css, encoding='utf-8')
    (out / 'options.js').write_text(options_js, encoding='utf-8')
print('portable unified MV3 builds refreshed', VERSION)
