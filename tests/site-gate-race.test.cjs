const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const flavor of ['typescript', 'portable']) {
  for (const rejectRead of [false, true]) {
    test(`${flavor}: newer disable survives ${rejectRead ? 'failed' : 'stale'} initial read`, async () => {
      let changed, resolveSite, rejectSite;
      const siteRead = new Promise((resolve, reject) => { resolveSite = resolve; rejectSite = reject; });
      const events = [];
      const document = {title: '', documentElement: {dataset: {}},
        querySelector: () => null, addEventListener() {}, removeEventListener() {},
        dispatchEvent: e => events.push(e)};
      const browser = {runtime: {onMessage: {addListener() {}}}, storage: {
        local: {get: key => key === 'ultradeckSites' ? siteRead : Promise.resolve({}), set: async () => {}},
        onChanged: {addListener: fn => {changed = fn;}}}};
      const context = {browser, document, location: {hostname:'www.tumblr.com', pathname:'/', reload() {}},
        window: {setTimeout: () => 1, clearTimeout() {}}, console,
        CustomEvent: class {constructor(type, init) {this.type=type;this.detail=init.detail;}},
        isChallengePage: () => false, defineContentScript: config => config.main()};
      if (flavor === 'typescript') {
        let source = fs.readFileSync('entrypoints/bridge.content.ts', 'utf8');
        source = source.replace(/^import .*;\n/gm, '').replace('export default ', '');
        vm.runInNewContext(stripTypeScriptTypes(source), context);
      } else {
        vm.runInNewContext(fs.readFileSync('dist-manual/chromium-mv3/bridge.js', 'utf8'), context);
      }
      await tick();
      changed({ultradeckSites: {newValue: {tumblr: false}}}, 'local');
      assert.equal(document.documentElement.dataset.tuSiteEnabled, '0');
      if (rejectRead) rejectSite(new Error('fixture storage failure'));
      else resolveSite({ultradeckSites: {tumblr: true}});
      await tick(); await tick();
      assert.equal(document.documentElement.dataset.tuSiteEnabled, '0');
      assert.equal(events.filter(e => e.type === 'ultradeck:command').length, 0);
    });
  }
}
