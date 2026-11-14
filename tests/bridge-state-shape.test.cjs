const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(flavor){
 let message;const listeners=new Set(),commands=[],writes=[];
 const document={title:'',documentElement:{dataset:{}},querySelector:()=>null,
 addEventListener:(n,f)=>{if(n==='ultradeck:state')listeners.add(f)},removeEventListener:(_n,f)=>listeners.delete(f),
 dispatchEvent:e=>{if(e.type==='ultradeck:command')commands.push(JSON.parse(e.detail));}};
 const browser={runtime:{onMessage:{addListener:f=>message=f}},storage:{local:{get:()=>new Promise(()=>{}),set:async v=>writes.push(v)},onChanged:{addListener(){}}}};
 let source=fs.readFileSync(flavor==='typescript'?'entrypoints/bridge.content.ts':'dist-manual/chromium-mv3/bridge.js','utf8');
 if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default ',''));
 vm.runInNewContext(source,{document,browser,location:{hostname:'www.tumblr.com',pathname:'/'},console,window:{setTimeout:()=>1,clearTimeout(){}},setTimeout:()=>1,clearTimeout(){},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},isChallengePage:()=>false,defineContentScript:c=>c.main()});
 return {writes,commands,emit:value=>{for(const f of [...listeners])f({detail:JSON.stringify(value)})},request:()=>flavor==='typescript'?message({type:'getState'}):new Promise(r=>message({type:'getState'},null,r))};
}
for(const flavor of ['typescript','portable']){
 test(`${flavor}: malformed state does not throw or consume pending response`,async()=>{
 const f=fixture(flavor),response=f.request();
 for(const value of [null,0,false,'text',[]])assert.doesNotThrow(()=>f.emit(value));
 f.emit({requestId:f.commands[0].requestId,version:'fixture'});
 const result=await response;assert.equal(result.ok,true);assert.equal(result.payload.version,'fixture');
 });
 test(`${flavor}: nonobject settings cannot overwrite storage`,async()=>{
 const f=fixture(flavor);
 for(const settings of [null,1,true,'text',[]])f.emit({settings});
 await tick();assert.equal(f.writes.length,0);
 f.emit({settings:{columns:4}});await tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0].ultradeckSettings.columns,4);
 });
}
