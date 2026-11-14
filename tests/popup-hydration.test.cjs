const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 let resolve,reject;const read=new Promise((a,b)=>{resolve=a;reject=b;}),writes=[],elements={};
 const element=id=>elements[id]??=( {id,checked:true,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}} );
 const document={getElementById:element,querySelectorAll:()=>[]};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:key=>key==='ultradeckSites'?read:Promise.resolve({}),set:async value=>writes.push(JSON.parse(JSON.stringify(value)))}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async()=>({ok:true,payload:{settings:{}}})}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/popup/main.ts':'dist-manual/chromium-mv3/popup.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{document,browser,console,URL,Option:class{},window:{setTimeout:()=>1},setTimeout:()=>1,clearTimeout(){}});
 return {elements,writes,resolve,reject};
}
for(const flavor of ['typescript','portable']){
 test(`${flavor}: early site edit merges untouched saved preferences`,async()=>{
  const f=fixture(flavor),el=f.elements['site-tumblr'];el.checked=false;const change=el.change({currentTarget:el});
  assert.equal(f.writes.length,0);
  f.resolve({ultradeckSites:{tumblr:true,patreon:false,x:false,tiktok:true}});await change;await tick();await tick();
  assert.equal(el.checked,false);assert.equal(f.writes.length,1);
  assert.deepEqual(f.writes[0].ultradeckSites,{tumblr:false,patreon:false,x:false,tiktok:true});
 });
 test(`${flavor}: failed storage hydration never persists defaults`,async()=>{
  const f=fixture(flavor),el=f.elements['site-tumblr'];el.checked=false;const change=el.change({currentTarget:el});
  f.reject(new Error('fixture load failed'));await change;await tick();
  assert.equal(f.writes.length,0);assert.match(f.elements.hint.textContent,/fixture load failed/);
 });
 test(`${flavor}: loaded popup edits continue to save`,async()=>{
  const f=fixture(flavor);f.resolve({ultradeckSites:{x:false}});await tick();await tick();
  const el=f.elements['site-patreon'];el.checked=false;await el.change({currentTarget:el});
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].ultradeckSites.x,false);assert.equal(f.writes[0].ultradeckSites.patreon,false);
 });
}
