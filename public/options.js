(()=>{'use strict';
const api=globalThis.browser?.storage?.local?globalThis.browser:globalThis.chrome;
const SITE_KEY='ultradeckSites';
const SURROUND_KEY='ultradeckSurroundSites';
const SITE_DEFAULTS=Object.freeze({tumblr:true,patreon:true,x:true,tiktok:true});
const SURROUND_DEFAULTS=Object.freeze({tumblr:false,patreon:false,x:false,tiktok:false});
const ids=Object.keys(SITE_DEFAULTS);
const status=document.getElementById('save-state');
const normalize=(value,defaults)=>{const out={...defaults};if(value&&typeof value==='object')for(const id of ids)if(typeof value[id]==='boolean')out[id]=value[id];return out;};
const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
async function load(){try{const stored=await Promise.resolve(api.storage.local.get([SITE_KEY,SURROUND_KEY]));const sites=normalize(stored?.[SITE_KEY],SITE_DEFAULTS);const surround=normalize(stored?.[SURROUND_KEY],SURROUND_DEFAULTS);for(const id of ids){document.getElementById(`site-${id}`).checked=sites[id];document.getElementById(`surround-${id}`).checked=surround[id];}setStatus('Saved');}catch(e){setStatus(`Could not load settings: ${e?.message||e}`,true);}}
async function save(){try{const sites={},surround={};for(const id of ids){sites[id]=document.getElementById(`site-${id}`).checked;surround[id]=document.getElementById(`surround-${id}`).checked;}await Promise.resolve(api.storage.local.set({[SITE_KEY]:sites,[SURROUND_KEY]:surround}));setStatus('Saved');}catch(e){setStatus(`Could not save settings: ${e?.message||e}`,true);}}
for(const el of document.querySelectorAll('[data-site],[data-surround]'))el.addEventListener('change',()=>{setStatus('Saving…');void save();});
void load();
})();
