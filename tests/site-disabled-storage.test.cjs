const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');
const tick = () => new Promise(r => setImmediate(r));
for (const flavor of ['typescript', 'portable']) {
  for (const pending of [false, true, null]) {
    test(`${flavor}: ${pending === null ? 'enabled settings still persist' : pending ? 'disabled pending surround write stops' : 'disabled settings do not persist'}`, async () => {
      let changed, release;
      const writes = [], listeners = [];
      const read = new Promise(r => {release = r;});
      const document = {title:'', documentElement:{dataset:{}}, querySelector:()=>null,
        addEventListener:(name, fn)=>{if(name==='ultradeck:state')listeners.push(fn);}, removeEventListener(){}, dispatchEvent(){}};
      const browser = {runtime:{onMessage:{addListener(){}}}, storage:{
        local:{get:key=>key==='ultradeckSurroundSites' ? read : Promise.resolve({}), set:async value=>{writes.push(value);}},
        onChanged:{addListener:fn=>{changed=fn;}}}};
      const context = {browser, document, location:{hostname:'www.tumblr.com',pathname:'/',reload(){}}, console,
        window:{setTimeout:()=>1,clearTimeout(){}},setTimeout:()=>1,clearTimeout(){},
        CustomEvent:class {},isChallengePage:()=>false,defineContentScript:c=>c.main()};
      let source = flavor==='typescript' ? fs.readFileSync('entrypoints/bridge.content.ts','utf8') : fs.readFileSync('dist-manual/chromium-mv3/bridge.js','utf8');
      if(flavor==='typescript')source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default ',''));
      vm.runInNewContext(source,context);
      const state = ()=>listeners[0]({detail:JSON.stringify({settings:{columns:7,surroundMode:true}})});
      if(pending)state();
      if(pending !== null)changed({ultradeckSites:{newValue:{tumblr:false}}},'local');
      if(!pending)state();
      release({ultradeckSurroundSites:{tumblr:false}});
      await tick();await tick();
      if(pending === null) {assert.equal(writes.length,2);return;}
      if(pending)assert.equal(writes.length,1); // general setting preceded disable
      else assert.equal(writes.length,0);
      assert.ok(writes.every(value=>!('ultradeckSurroundSites' in value)));
    });
  }
}
