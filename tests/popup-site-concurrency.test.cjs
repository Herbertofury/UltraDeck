const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 const elements={},writes=[];
 const element=id=>elements[id]??={id,checked:true,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:async()=>({}),set:value=>new Promise((resolve,reject)=>writes.push({value:JSON.parse(JSON.stringify(value)),resolve,reject}))}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async()=>({ok:true,payload:{settings:{}}})}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/popup/main.ts':'dist-manual/chromium-mv3/popup.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{document:{getElementById:element,querySelectorAll:()=>[]},browser,console,URL,Option:class{},window:{setTimeout:()=>1},setTimeout:()=>1,clearTimeout(){}});
 return {elements,writes,edit(id,checked){const e=element('site-'+id);e.checked=checked;return e.change({currentTarget:e});}};
}
for(const flavor of ['typescript','portable']){
 test(`${flavor}: failed site write cannot leak into another queued site's save`,async()=>{
 const f=fixture(flavor);await tick();await tick();
 const first=f.edit('tumblr',false);await tick();const second=f.edit('x',false);await tick();
 assert.equal(f.writes.length,1,'site writes must not race');
 f.writes[0].reject(Error('fixture disk full'));await first;await tick();
 assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1].value.ultradeckSites,{tumblr:true,patreon:true,x:false,tiktok:true});
 f.writes[1].resolve();await second;assert.equal(f.elements['site-tumblr'].checked,true);assert.equal(f.elements['site-x'].checked,false);
 });
 test(`${flavor}: rapid repeated edits retain the newest checkbox while earlier save fails`,async()=>{
 const f=fixture(flavor);await tick();await tick();
 const first=f.edit('tumblr',false);await tick();const second=f.edit('tumblr',true);await tick();
 assert.equal(f.writes.length,1);f.writes[0].reject(Error('fixture disk full'));await first;await tick();assert.equal(f.elements['site-tumblr'].checked,true);
 f.writes[1].resolve();await second;assert.equal(f.writes[1].value.ultradeckSites.tumblr,true);assert.equal(f.elements['site-tumblr'].checked,true);
 });
}
