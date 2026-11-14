const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 let resolve,reject;const read=new Promise((a,b)=>{resolve=a;reject=b;}),writes=[],commands=[],elements={};let failWrite=false;
 const element=id=>elements[id]??=( {id,checked:true,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}} );
 const document={getElementById:element,querySelectorAll:()=>[]};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:key=>key==='ultradeckSites'?read:Promise.resolve({}),set:async value=>{if(failWrite)throw Error('fixture storage unavailable');writes.push(JSON.parse(JSON.stringify(value)))}}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async(id,message)=>{commands.push(message);return {ok:true,payload:{settings:{surroundMode:message.value?.surroundMode??false}}}}}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/popup/main.ts':'dist-manual/chromium-mv3/popup.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{document,browser,console,URL,Option:class{},window:{setTimeout:()=>1},setTimeout:()=>1,clearTimeout(){}});
 return {elements,writes,commands,resolve,reject,setFailure(v){failWrite=v}};
}
test('surround write rejection is handled and later retry preserves preferences',async()=>{
 const f=fixture('typescript');f.resolve({});await tick();await tick();f.commands.length=0;
 f.setFailure(true);const el=f.elements.surround;el.checked=true;
 await assert.doesNotReject(el.change({currentTarget:el}));
 assert.equal(el.checked,false);assert.equal(f.writes.length,0);assert.equal(f.commands.length,0);assert.match(f.elements.hint.textContent,/fixture storage unavailable/);
 f.setFailure(false);el.checked=true;await el.change({currentTarget:el});
 assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].ultradeckSurroundSites,{tumblr:true,patreon:false,x:false,tiktok:false});assert.equal(f.commands.length,1);assert.equal(f.commands[0].value.surroundMode,true);assert.equal(el.checked,true);
});
function concurrentFixture(){
 const elements={},writes=[],commands=[];
 const element=id=>elements[id]??={id,checked:false,value:'',textContent:'',append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}};
 const browser={runtime:{openOptionsPage(){}},storage:{local:{get:async()=>({}),set:value=>new Promise((resolve,reject)=>writes.push({value:JSON.parse(JSON.stringify(value)),resolve,reject}))}},tabs:{query:async()=>[{id:1,url:'https://www.tumblr.com/'}],sendMessage:async(id,message)=>{commands.push(message);return {ok:true,payload:{settings:{surroundMode:message.value?.surroundMode??false}}};}}};
 const source=stripTypeScriptTypes(fs.readFileSync('entrypoints/popup/main.ts','utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{document:{getElementById:element,querySelectorAll:()=>[]},browser,console,URL,Option:class{},window:{setTimeout:()=>1},setTimeout:()=>1,clearTimeout(){}});
 return {elements,writes,commands,edit(checked){const e=element('surround');e.checked=checked;return e.change({currentTarget:e});}};
}
test('rapid surround changes serialize writes and preserve newest checkbox through older response',async()=>{
 const f=concurrentFixture();await tick();await tick();f.commands.length=0;
 const first=f.edit(true);await tick();const second=f.edit(false);await tick();
 assert.equal(f.writes.length,1,'surround storage writes must not race');
 f.writes[0].resolve();await first;await tick();
 assert.equal(f.elements.surround.checked,false,'older response must not undo newer intent');
 assert.equal(f.writes.length,2);assert.equal(f.writes[1].value.ultradeckSurroundSites.tumblr,false);
 f.writes[1].resolve();await second;
 assert.deepEqual(f.commands.map(c=>c.value.surroundMode),[true,false]);assert.equal(f.elements.surround.checked,false);
});
test('failed earlier surround save preserves a newer pending edit and permits retry',async()=>{
 const f=concurrentFixture();await tick();await tick();f.commands.length=0;
 const first=f.edit(true);await tick();const second=f.edit(false);await tick();const third=f.edit(true);await tick();
 assert.equal(f.writes.length,1);f.writes[0].reject(Error('fixture full'));await first;await tick();
 assert.equal(f.elements.surround.checked,true);f.writes[1].resolve();await second;await tick();
 assert.equal(f.elements.surround.checked,true);f.writes[2].resolve();await third;
 assert.deepEqual(f.commands.map(c=>c.value.surroundMode),[false,true]);assert.equal(f.elements.surround.checked,true);
});
