from pathlib import Path
import json, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT/'shared-runtime-source/build_runtime.py')], check=True)
VERSION = '8.4.0'
DESC = 'Lossless multi-column retained feeds for Tumblr, Patreon, and X with native-backed off-screen interactions and HQ media.'
HOSTS = ['https://www.tumblr.com/*','https://www.patreon.com/*','https://x.com/*','https://twitter.com/*']
SITE_SCRIPTS = [
    (['https://www.tumblr.com/*'], 'site-tumblr.js'),
    (['https://www.patreon.com/*'], 'site-patreon.js'),
    (['https://x.com/*','https://twitter.com/*'], 'site-x.js'),
]
css = (ROOT/'entrypoints/popup/style.css').read_text(encoding='utf-8')
html = (ROOT/'entrypoints/popup/index.html').read_text(encoding='utf-8').replace('<script type="module" src="./main.ts"></script>','<script src="popup.js"></script>')
bridge = """(()=>{'use strict';const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,COMMAND='ultradeck:command',STATE='ultradeck:state',KEY='ultradeckSettings';let seq=0;function cmd(type,value,timeout=2500){const requestId=`ext-${Date.now()}-${++seq}`;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{document.removeEventListener(STATE,on,true);reject(new Error(`UltraDeck page bridge timed out: ${type}`));},timeout);function on(e){let p;try{p=JSON.parse(String(e.detail||'{}'));}catch{return;}if(p.requestId!==requestId)return;clearTimeout(t);document.removeEventListener(STATE,on,true);resolve(p);}document.addEventListener(STATE,on,true);document.dispatchEvent(new CustomEvent(COMMAND,{detail:JSON.stringify({type,value,requestId})}));});}document.addEventListener(STATE,e=>{try{const p=JSON.parse(String(e.detail||'{}'));if(p.settings)void ext.storage.local.set({[KEY]:p.settings});}catch{}},true);ext.runtime.onMessage.addListener((m,_s,send)=>{if(!m||typeof m.type!=='string')return;cmd(m.type,m.value).then(payload=>send({ok:true,payload})).catch(error=>send({ok:false,error:error.message}));return true;});void Promise.resolve(ext.storage.local.get(KEY)).then(v=>{if(v?.[KEY])return cmd('setSettings',v[KEY],5000);}).catch(()=>{});})();"""
popup = """(()=>{'use strict';const ext=globalThis.browser?.runtime?globalThis.browser:globalThis.chrome,$=id=>document.getElementById(id),status=$('status'),hint=$('hint'),diag=$('diag'),columns=$('columns');for(let i=1;i<=20;i++)columns.append(new Option(String(i),String(i)));let state=null,timer=0;async function tab(){return(await Promise.resolve(ext.tabs.query({active:true,currentWindow:true})))[0]}async function command(type,value){const t=await tab();if(!t?.id)throw new Error('No active tab');const r=await Promise.resolve(ext.tabs.sendMessage(t.id,{type,value}));if(!r?.ok)throw new Error(r?.error||'UltraDeck bridge unavailable');state=r.payload||null;render();return state}function render(){const d=state?.diagnostics||{},s=state?.settings||{},site=String(state?.siteLabel||d.siteLabel||state?.site||d.site||'site');$('version').textContent=state?.version?`v${state.version}`:'v__ULTRADECK_VERSION__';$('posts').textContent=String(d.cachedPosts??d.posts??0);$('cols').textContent=String(d.renderedColumns??d.columns??0);$('media').textContent=String(d.mediaQualityReady??d.media?.qualityReady??0);columns.value=String(s.columns??'auto');$('layout').value=String(s.layoutMode??'masonry');$('mediaOnly').checked=Boolean(s.mediaOnly??false);$('turbo').checked=Boolean(s.turboMedia??true);$('minWidth').value=String(s.minCardWidth??320);$('minWidthOut').textContent=`${s.minCardWidth??320}px`;$('minHeight').value=String(s.minCardHeight??0);$('minHeightOut').textContent=Number(s.minCardHeight??0)?`${s.minCardHeight}px`:'Natural';$('gap').value=String(s.gap??16);$('gapOut').textContent=`${s.gap??16}px`;diag.textContent=JSON.stringify(d,null,2);status.textContent=`Live · ${site}`;status.classList.add('ok');hint.textContent=`Settings are synchronized with ${site} and extension storage.`}function fail(e){status.textContent='Not connected';status.classList.remove('ok');hint.textContent=e?.message||String(e)}function bind(id,type){$(id).addEventListener('click',()=>command(type).catch(fail))}columns.addEventListener('change',()=>command('setColumns',columns.value==='auto'?'auto':Number(columns.value)).catch(fail));$('layout').addEventListener('change',e=>command('setSettings',{layoutMode:e.currentTarget.value}).catch(fail));$('mediaOnly').addEventListener('change',e=>command('setSettings',{mediaOnly:e.currentTarget.checked}).catch(fail));$('turbo').addEventListener('change',e=>command('setSettings',{turboMedia:e.currentTarget.checked}).catch(fail));for(const id of ['minWidth','minHeight','gap'])$(id).addEventListener('input',()=>{if(timer)clearTimeout(timer);const input=$(id);$(id+'Out').textContent=id==='minHeight'&&Number(input.value)===0?'Natural':`${input.value}px`;const payload=id==='minWidth'?{minCardWidth:Number(input.value)}:id==='minHeight'?{minCardHeight:Number(input.value)}:{gap:Number(input.value)};timer=setTimeout(()=>command('setSettings',payload).catch(fail),100)});bind('nav','toggleNav');bind('extras','toggleExtras');bind('focus','toggleFocus');bind('sync','syncMedia');bind('rebalance','rebalance');bind('rescan','rescan');command('getState').catch(fail);})();"""
popup = popup.replace('__ULTRADECK_VERSION__', VERSION)

for browser in ('chromium','firefox'):
    out = ROOT/'dist-manual'/f'{browser}-mv3'
    out.mkdir(parents=True, exist_ok=True)
    content_scripts=[]
    for matches, adapter in SITE_SCRIPTS:
        content_scripts.append({'matches':matches,'js':[adapter,'runtime-main.js'],'run_at':'document_start','world':'MAIN'})
    content_scripts.append({'matches':HOSTS,'js':['bridge.js'],'run_at':'document_start','world':'ISOLATED'})
    manifest = {
        'manifest_version':3,'name':'UltraDeck','version':VERSION,'description':DESC,
        'permissions':['storage','activeTab'],'host_permissions':HOSTS,
        'action':{'default_popup':'popup.html','default_title':'UltraDeck'},
        'content_scripts':content_scripts,
    }
    if browser == 'firefox':
        manifest['browser_specific_settings']={'gecko':{'id':'ultradeck-tumblr@bert.local','strict_min_version':'128.0'}}
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    (out/'bridge.js').write_text(bridge+'\n', encoding='utf-8')
    (out/'popup.html').write_text(html, encoding='utf-8')
    (out/'popup.css').write_text(css, encoding='utf-8')
    (out/'popup.js').write_text(popup+'\n', encoding='utf-8')
print('portable unified MV3 builds refreshed', VERSION)
