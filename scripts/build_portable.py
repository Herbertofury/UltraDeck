from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'shared-runtime-source/build_runtime.py')], check=True)
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DESC = 'Lossless multi-column retained feeds for Tumblr, Patreon, X, and TikTok with challenge-safe loading and native-backed interactions.'
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
const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,COMMAND='ultradeck:command',STATE='ultradeck:state',GATE='ultradeck:site-gate',KEY='ultradeckSettings',SITE_KEY='ultradeckSites',SURROUND_KEY='ultradeckSurroundSites',DEFAULTS={tumblr:true,patreon:true,x:true,tiktok:true},SURROUND_DEFAULTS={tumblr:false,patreon:false,x:false,tiktok:false};let seq=0,enabled=true,ready=false;
const site=(()=>{const h=location.hostname.toLowerCase().replace(/^www\./,'');if(h==='tumblr.com')return'tumblr';if(h==='patreon.com')return'patreon';if(h==='x.com'||h==='twitter.com')return'x';if(h==='tiktok.com'||h.endsWith('.tiktok.com'))return'tiktok';return null;})();
const challenge=()=>site==='x'&&(/just a moment|checking your browser|verify you are human|security verification|attention required/i.test(document.title||'')||location.pathname.startsWith('/cdn-cgi/')||!!document.querySelector('#challenge-running,#cf-chl-widget,[data-cf-challenge],iframe[src*="challenges.cloudflare.com"],script[src*="/cdn-cgi/challenge-platform/"]'));
if(challenge())return;
const app=()=>site!=='x'||!!document.querySelector('#react-root,[data-testid="primaryColumn"],main[role="main"]');
const waitX=()=>site!=='x'?Promise.resolve(true):new Promise(resolve=>{let done=false,o=null;const finish=v=>{if(done)return;done=true;o?.disconnect();resolve(v)};const check=()=>{if(challenge())return finish(false);if(app())return finish(true)};o=new MutationObserver(check);if(document.documentElement)o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>finish(false),15000);check()});
const norm=(v,d=DEFAULTS)=>{const o={...d};if(v&&typeof v==='object')for(const k of Object.keys(d))if(typeof v[k]==='boolean')o[k]=v[k];return o};
function publish(next){if(challenge())return;enabled=next;ready=true;const root=document.documentElement;if(root){root.dataset.tuSiteEnabled=next?'1':'0';root.dataset.tuSiteId=site||'unknown'}document.dispatchEvent(new CustomEvent(GATE,{detail:JSON.stringify({site,enabled:next})}));}
function cmd(type,value,timeout=2500){if(challenge())return Promise.reject(new Error('UltraDeck is inactive on the X verification page.'));if(ready&&!enabled)return Promise.reject(new Error(`UltraDeck is disabled on ${site||'this site'}.`));const requestId=`ext-${Date.now()}-${++seq}`;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{document.removeEventListener(STATE,on,true);reject(new Error(`UltraDeck page bridge timed out: ${type}`));},timeout);function on(e){let p;try{p=JSON.parse(String(e.detail||'{}'))}catch{return}if(p.requestId!==requestId)return;clearTimeout(t);document.removeEventListener(STATE,on,true);resolve(p)}document.addEventListener(STATE,on,true);document.dispatchEvent(new CustomEvent(COMMAND,{detail:JSON.stringify({type,value,requestId})}))})}
document.addEventListener(STATE,e=>{if(challenge())return;try{const p=JSON.parse(String(e.detail||'{}'));if(!p.settings)return;const{surroundMode,...general}=p.settings;void ext.storage.local.set({[KEY]:general});if(site&&typeof surroundMode==='boolean')void Promise.resolve(ext.storage.local.get(SURROUND_KEY)).then(v=>{const a=norm(v?.[SURROUND_KEY],SURROUND_DEFAULTS);if(a[site]===surroundMode)return;a[site]=surroundMode;return ext.storage.local.set({[SURROUND_KEY]:a})})}catch{}},true);
ext.runtime.onMessage.addListener((m,_s,send)=>{if(!m||typeof m.type!=='string')return;if(challenge()){send({ok:false,challenge:true,site,error:'UltraDeck is inactive on the X verification page.'});return}if(ready&&!enabled){send({ok:false,disabled:true,site,error:`UltraDeck is disabled on ${site||'this site'}.`});return}cmd(m.type,m.value).then(payload=>send({ok:true,payload})).catch(error=>send({ok:false,error:error.message}));return true});
ext.storage.onChanged.addListener((changes,area)=>{if(challenge()||area!=='local'||!site)return;if(changes[SITE_KEY]){const next=norm(changes[SITE_KEY].newValue)[site];if(!ready){publish(next);return}if(next!==enabled){publish(next);location.reload();return}}if(enabled&&changes[SURROUND_KEY]){const a=norm(changes[SURROUND_KEY].newValue,SURROUND_DEFAULTS);void cmd('setSettings',{surroundMode:a[site]},5000).catch(()=>{})}});
void Promise.all([waitX(),Promise.resolve(ext.storage.local.get(SITE_KEY)),Promise.resolve(ext.storage.local.get(KEY)),Promise.resolve(ext.storage.local.get(SURROUND_KEY))]).then(([safe,siteStore,generalStore,surroundStore])=>{if(!safe||challenge())return;const prefs=norm(siteStore?.[SITE_KEY]);publish(site?prefs[site]:false);if(!enabled)return;const general=generalStore?.[KEY]&&typeof generalStore[KEY]==='object'?{...generalStore[KEY]}:{};const surround=norm(surroundStore?.[SURROUND_KEY],SURROUND_DEFAULTS);return cmd('setSettings',{...general,surroundMode:site?surround[site]:false},5000)}).catch(()=>{if(site!=='x'&&!challenge())publish(true)});
})();"""

loader = r"""(()=>{'use strict';
const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,SITE_KEY='ultradeckSites',DEFAULTS={tumblr:true,patreon:true,x:true,tiktok:true};
const site=(()=>{const h=location.hostname.toLowerCase().replace(/^www\./,'');if(h==='tumblr.com')return'tumblr';if(h==='patreon.com')return'patreon';if(h==='x.com'||h==='twitter.com')return'x';if(h==='tiktok.com'||h.endsWith('.tiktok.com'))return'tiktok';return null;})();
if(!site)return;
const EVIDENCE={tumblr:['[data-timeline]','[data-timeline-id]','main'],patreon:['main','[role="main"]','a[href*="/posts/"]'],x:['#react-root','[data-testid="primaryColumn"]','main[role="main"]'],tiktok:['#app','[data-e2e="recommend-list"]','main']};
const FALLBACK={tumblr:1800,patreon:1800,x:2600,tiktok:2200};
const challenge=()=>site==='x'&&(/just a moment|checking your browser|verify you are human|security verification|attention required/i.test(document.title||'')||location.pathname.startsWith('/cdn-cgi/')||!!document.querySelector('#challenge-running,#cf-chl-widget,[data-cf-challenge],iframe[src*="challenges.cloudflare.com"],script[src*="/cdn-cgi/challenge-platform/"]'));
const norm=v=>{const o={...DEFAULTS};if(v&&typeof v==='object')for(const k of Object.keys(DEFAULTS))if(typeof v[k]==='boolean')o[k]=v[k];return o};
const inject=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=ext.runtime.getURL(src);s.onload=()=>{s.remove();resolve()};s.onerror=()=>{s.remove();reject(new Error(`UltraDeck failed to inject ${src}`))};(document.head||document.documentElement).appendChild(s)});
function evidence(){for(const sel of EVIDENCE[site])try{if(document.querySelector(sel))return true}catch{}return false}
async function waitSafe(){if(challenge())return false;const start=performance.now();return await new Promise(resolve=>{let done=false,o=null;const finish=v=>{if(done)return;done=true;o?.disconnect();resolve(v)};const check=()=>{if(challenge())return finish(false);if(evidence())return finish(true);const elapsed=performance.now()-start;if(elapsed>=15000)return finish(site!=='x'&&document.readyState!=='loading');if(elapsed>=FALLBACK[site]&&document.readyState!=='loading'&&document.body)return finish(true)};o=new MutationObserver(check);if(document.documentElement)o.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('readystatechange',check,{passive:true});setTimeout(check,FALLBACK[site]);setTimeout(check,15000);check()})}
void Promise.resolve(ext.storage.local.get(SITE_KEY)).then(async v=>{if(!norm(v?.[SITE_KEY])[site]||challenge())return;if(!(await waitSafe())||challenge())return;await inject(`site-${site}.js`);if(challenge())return;await inject('runtime-main.js')}).catch(err=>console.error('[UltraDeck] safe loader failed',err));
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
        {'matches': HOSTS, 'js': ['bridge.js', 'site-loader.js'], 'run_at': 'document_start', 'world': 'ISOLATED'},
    ]
    manifest = {
        'manifest_version': 3, 'name': 'UltraDeck', 'version': VERSION, 'description': DESC,
        'permissions': ['storage', 'activeTab'], 'host_permissions': HOSTS,
        'action': {'default_popup': 'popup.html', 'default_title': 'UltraDeck'},
        'options_ui': {'page': 'options.html', 'open_in_tab': True},
        'content_scripts': content_scripts,
        'web_accessible_resources': [{'resources': ['site-*.js', 'runtime-main.js'], 'matches': HOSTS}],
    }
    if browser == 'firefox':
        manifest['browser_specific_settings'] = {'gecko': {'id': 'ultradeck-tumblr@bert.local', 'strict_min_version': '128.0'}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (out / 'bridge.js').write_text(bridge + '\n', encoding='utf-8')
    (out / 'site-loader.js').write_text(loader + '\n', encoding='utf-8')
    (out / 'popup.html').write_text(html, encoding='utf-8')
    (out / 'popup.css').write_text(css, encoding='utf-8')
    (out / 'popup.js').write_text(popup.replace('v8.5.0', f'v{VERSION}') + '\n', encoding='utf-8')
    (out / 'options.html').write_text(options_html, encoding='utf-8')
    (out / 'options.css').write_text(options_css, encoding='utf-8')
    (out / 'options.js').write_text(options_js, encoding='utf-8')
print('portable unified MV3 builds refreshed', VERSION)
