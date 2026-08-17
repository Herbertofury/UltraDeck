import '../src/adapters/tumblr.js';
import { startUltraDeck } from '../src/runtime/ultradeck-runtime.js';

export default defineContentScript({
  matches: ['https://www.tumblr.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() { startUltraDeck(); },
});
