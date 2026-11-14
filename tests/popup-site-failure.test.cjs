const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 let resolve,reject;const read=new Promise((a,b)=>{resolve=a;reject=b;}),writes=[],commands=[],elements={};let failWrite=false;
 const element=id=>elements[id]??=( {id,checked:true,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}} );
 const document={getElementById:element,querySelectorAll:()=>[]};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:key=>key==='ultradeckSites'?read:Promise.resolve({}),set:async value=>{if(failWrite)throw Error('fixture storage unavailable');writes.push(JSON.parse(JSON.stringify(value)))}}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async(id,message)=>{commands.push(JSON.parse(JSON.stringify(message)));return {ok:true,payload:{settings:{}}}}}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/popup/main.ts':'dist-manual/chromium-mv3/popup.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{document,browser,console,URL,Option:class{},window:{setTimeout:()=>1},setTimeout:()=>1,clearTimeout(){}});
 return {elements,writes,commands,resolve,reject,setFailure(v){failWrite=v}};
}
for(const flavor of ['typescript','portable'])for(const early of [false,true]){
 test(`${flavor}: failed ${early?'early':'loaded'} site disable preserves committed enablement and allows retry`,async()=>{
 const f=fixture(flavor);const saved={ultradeckSites:{tumblr:true,patreon:false,x:false,tiktok:true}};
 if(!early){f.resolve(saved);await tick();await tick();}
 f.setFailure(true);const el=f.elements['site-tumblr'];el.checked=false;const change=el.change({currentTarget:el});
 if(early)f.resolve(saved);await change;await tick();await tick();
 assert.equal(el.checked,true);assert.equal(f.writes.length,0);assert.match(f.elements.hint.textContent,/fixture storage unavailable/);
 f.commands.length=0;await f.elements.rescan.click();await tick();await tick();assert.equal(f.commands.length,1);assert.equal(f.commands[0].type,'rescan');
 f.setFailure(false);el.checked=false;await el.change({currentTarget:el});assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].ultradeckSites,{tumblr:false,patreon:false,x:false,tiktok:true});assert.equal(el.checked,false);
 });
}
for(const flavor of ['typescript','portable'])test(`${flavor}: failed enable keeps saved disabled site unavailable`,async()=>{
 const f=fixture(flavor);f.resolve({ultradeckSites:{tumblr:false}});await tick();await tick();f.setFailure(true);
 const el=f.elements['site-tumblr'];el.checked=true;await el.change({currentTarget:el});assert.equal(el.checked,false);assert.equal(f.writes.length,0);
 f.commands.length=0;await f.elements.rescan.click();await tick();assert.equal(f.commands.length,0);
});
