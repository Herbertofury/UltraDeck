const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const flavor of ['typescript', 'portable']) {
  for (const disableDuringWait of [true, false]) {
  test(`${flavor}: readiness respects enabled=${!disableDuringWait}`, async () => {
    let enabled = true, evidence = false, observer;
    const injected = [], handlers = new Map();
    const storage = {local: {get: async () => ({ultradeckSites: {tumblr: enabled}})}};
    const document = {title: '', readyState: 'loading', body: {}, documentElement: {},
      querySelector: selector => selector.includes("challenge") ? null : (evidence ? {} : null),
      addEventListener: (type, fn) => handlers.set(type, fn),
      removeEventListener: (type, fn) => {if (handlers.get(type) === fn) handlers.delete(type);},
      createElement: () => ({remove() {}}),
      head: {appendChild: s => {injected.push(s.src); s.onload();}}};
    const context = {document, location: {hostname: 'www.tumblr.com', pathname: '/'},
      performance: {now: () => 0}, setTimeout: () => 1, console,
      MutationObserver: class {constructor(fn) {observer = fn;} observe() {} disconnect() {}},
      browser: {runtime: {getURL: x => x}, storage}, injectScript: async src => injected.push(src)};
    if (flavor === 'typescript') {
      let source = fs.readFileSync('src/extension/site-runtime-loader.ts', 'utf8');
      source = source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
      vm.runInNewContext(stripTypeScriptTypes(source) + '\nstartSiteRuntime({isValid:true,setTimeout}, "tumblr");', context);
    } else {
      vm.runInNewContext(fs.readFileSync('dist-manual/chromium-mv3/site-loader.js', 'utf8'), context);
    }
    await tick();
    assert.equal(injected.length, 0);
    enabled = !disableDuringWait; evidence = true; observer();
    await tick(); await tick();
    assert.equal(injected.length, disableDuringWait ? 0 : (flavor === 'typescript' ? 1 : 2),
      'only currently enabled sites should load');
  });
  }
}
