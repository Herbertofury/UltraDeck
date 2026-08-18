import { startSiteRuntime } from '../src/extension/site-runtime-loader';

export default defineContentScript({
  matches: ['https://www.tiktok.com/*', 'https://tiktok.com/*', 'https://*.tiktok.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  noScriptStartedPostMessage: true,
  main(ctx) { return startSiteRuntime(ctx, 'tiktok'); },
});
