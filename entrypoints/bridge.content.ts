import { browser } from 'wxt/browser';

type DeckMessage = { type: string; value?: unknown; requestId?: string };
type DeckState = { requestId?: string; version?: string; diagnostics?: Record<string, unknown>; settings?: Record<string, unknown> };

const COMMAND_EVENT = 'ultradeck:command';
const STATE_EVENT = 'ultradeck:state';
const STORAGE_KEY = 'ultradeckSettings';
let sequence = 0;

function pageCommand(type: string, value?: unknown, timeoutMs = 2500): Promise<DeckState> {
  const requestId = `ext-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      document.removeEventListener(STATE_EVENT, onState as EventListener, true);
      reject(new Error(`UltraDeck page bridge timed out: ${type}`));
    }, timeoutMs);
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      let payload: DeckState | null = null;
      try { payload = JSON.parse(String(detail || '{}')) as DeckState; } catch { return; }
      if (payload.requestId !== requestId) return;
      window.clearTimeout(timeout);
      document.removeEventListener(STATE_EVENT, onState as EventListener, true);
      resolve(payload);
    };
    document.addEventListener(STATE_EVENT, onState as EventListener, true);
    document.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: JSON.stringify({ type, value, requestId }) }));
  });
}

async function restoreSettings() {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const settings = stored[STORAGE_KEY];
    if (settings && typeof settings === 'object') await pageCommand('setSettings', settings, 5000);
  } catch {
    // The page-local settings remain authoritative if extension storage is unavailable.
  }
}

document.addEventListener(STATE_EVENT, (event) => {
  try {
    const payload = JSON.parse(String((event as CustomEvent<string>).detail || '{}')) as DeckState;
    if (payload.settings) void browser.storage.local.set({ [STORAGE_KEY]: payload.settings });
  } catch {}
}, true);

browser.runtime.onMessage.addListener((message: DeckMessage) => {
  if (!message || typeof message.type !== 'string') return undefined;
  return pageCommand(message.type, message.value).then((payload) => ({ ok: true, payload })).catch((error: Error) => ({ ok: false, error: error.message }));
});

void restoreSettings();
