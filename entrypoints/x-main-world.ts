import '../src/adapters/x.js';
import { startUltraDeck } from '../src/runtime/ultradeck-runtime.js';

export default defineUnlistedScript(() => {
  startUltraDeck();
});
