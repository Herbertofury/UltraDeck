import '../src/adapters/patreon.js';
import { startUltraDeck } from '../src/runtime/ultradeck-runtime.js';

export default defineContentScript({
  matches: ['https://www.patreon.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() { startUltraDeck(); },
});
