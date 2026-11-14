const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let resolve,reject;const stored=new Promise((a,b)=>{resolve=a;reject=b;}),writes=[],elements={};
 for(const site of ['tumblr','patreon','x','tiktok'])for(const group of ['site','surround']){
  const id=`${group}-${site}`;elements[id]={id,checked:group==='site',addEventListener(_event,fn){this.change=fn;}};
 }
 elements['save-state']={textContent:'',classList:{toggle(){}}};
 const document={getElementById:id=>elements[id],querySelectorAll:()=>Object.values(elements).filter(e=>e.id)};
 const browser={storage:{local:{get:()=>stored,set:async value=>writes.push(JSON.parse(JSON.stringify(value)))}}};
 vm.runInNewContext(fs.readFileSync('public/options.js','utf8'),{document,browser,console});return{elements,writes,resolve,reject};
}
test('early edit is merged with untouched saved choices before persisting',async()=>{
 const f=fixture();f.elements['site-tumblr'].checked=false;f.elements['site-tumblr'].change();
 assert.equal(f.writes.length,0);
 f.resolve({ultradeckSites:{tumblr:true,patreon:false,x:false,tiktok:true},ultradeckSurroundSites:{x:true}});
 await tick();await tick();assert.equal(f.elements['site-tumblr'].checked,false);assert.equal(f.writes.length,1);
 assert.deepEqual(f.writes[0].ultradeckSites,{tumblr:false,patreon:false,x:false,tiktok:true});assert.equal(f.writes[0].ultradeckSurroundSites.x,true);
});
test('failed initial read does not overwrite unknown saved settings',async()=>{
 const f=fixture();f.elements['surround-x'].checked=true;f.elements['surround-x'].change();f.reject(new Error('unavailable'));
 await tick();await tick();assert.equal(f.writes.length,0);assert.match(f.elements['save-state'].textContent,/Could not/);
});
test('normal loaded edit still persists',async()=>{
 const f=fixture();f.resolve({});await tick();f.elements['surround-patreon'].checked=true;f.elements['surround-patreon'].change();
 await tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0].ultradeckSurroundSites.patreon,true);
});
