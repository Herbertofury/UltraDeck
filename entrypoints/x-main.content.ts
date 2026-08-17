import '../src/adapters/x.js';
import { startUltraDeck } from '../src/runtime/ultradeck-runtime.js';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() { startUltraDeck(); },
});
