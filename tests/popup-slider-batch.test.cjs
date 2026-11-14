const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 let resolve,reject;const read=new Promise((a,b)=>{resolve=a;reject=b;}),writes=[],commands=[],timers=new Map(),elements={};let nextTimer=0;
 const element=id=>elements[id]??=( {id,checked:true,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}} );
 const document={getElementById:element,querySelectorAll:()=>[]};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:key=>key==='ultradeckSites'?read:Promise.resolve({}),set:async value=>writes.push(JSON.parse(JSON.stringify(value)))}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async(id,message)=>{commands.push(JSON.parse(JSON.stringify(message)));return {ok:true,payload:{settings:{}}}}}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/popup/main.ts':'dist-manual/chromium-mv3/popup.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 const schedule=fn=>{timers.set(++nextTimer,fn);return nextTimer};vm.runInNewContext(source,{document,browser,console,URL,Option:class{},window:{setTimeout:schedule},setTimeout:schedule,clearTimeout:id=>timers.delete(id)});
 return {elements,writes,commands,resolve,reject,flush(){const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();}};
}
for(const flavor of ['typescript','portable']){
 test(`${flavor}: one debounce preserves each slider and latest repeated value`,async()=>{
 const f=fixture(flavor);f.resolve({});await tick();await tick();f.commands.length=0;
 for(const [id,value]of [['minWidth','400'],['gap','22'],['minHeight','300'],['minWidth','480']]){f.elements[id].value=value;f.elements[id].input();}
 assert.equal(f.commands.length,0);f.flush();await tick();await tick();
 assert.deepEqual(f.commands,[{type:'setSettings',value:{minCardWidth:480,gap:22,minCardHeight:300}}]);
 f.commands.length=0;f.elements.gap.value='24';f.elements.gap.input();f.flush();await tick();await tick();
 assert.deepEqual(f.commands,[{type:'setSettings',value:{gap:24}}]);
 });
}
