import { startSiteRuntime } from '../src/extension/site-runtime-loader';

export default defineContentScript({
  matches: ['https://www.patreon.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  noScriptStartedPostMessage: true,
  main(ctx) { return startSiteRuntime(ctx, 'patreon'); },
});
