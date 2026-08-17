import '../src/adapters/tiktok.js';
import { startUltraDeck } from '../src/runtime/ultradeck-runtime.js';

export default defineContentScript({
  matches: ['https://www.tiktok.com/*', 'https://tiktok.com/*', 'https://*.tiktok.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() { startUltraDeck(); },
});
