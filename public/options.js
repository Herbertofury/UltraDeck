(()=>{'use strict';
const api=globalThis.browser?.storage?.local?globalThis.browser:globalThis.chrome;
const KEY='ultradeckSites';
const DEFAULTS=Object.freeze({tumblr:true,patreon:true,x:true,tiktok:true});
const ids=Object.keys(DEFAULTS);
const status=document.getElementById('save-state');
const normalize=(value)=>{const out={...DEFAULTS};if(value&&typeof value==='object')for(const id of ids)if(typeof value[id]==='boolean')out[id]=value[id];return out;};
const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
async function load(){try{const stored=await Promise.resolve(api.storage.local.get(KEY));const prefs=normalize(stored?.[KEY]);for(const id of ids)document.getElementById(`site-${id}`).checked=prefs[id];setStatus('Saved');}catch(e){setStatus(`Could not load settings: ${e?.message||e}`,true);}}
async function save(){try{const prefs={};for(const id of ids)prefs[id]=document.getElementById(`site-${id}`).checked;await Promise.resolve(api.storage.local.set({[KEY]:prefs}));setStatus('Saved');}catch(e){setStatus(`Could not save settings: ${e?.message||e}`,true);}}
for(const el of document.querySelectorAll('[data-site]'))el.addEventListener('change',()=>{setStatus('Saving…');void save();});
void load();
})();
