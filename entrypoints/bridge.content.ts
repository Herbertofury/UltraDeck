import { browser } from 'wxt/browser';

type DeckMessage = { type: string; value?: unknown; requestId?: string };
type DeckState = { requestId?: string; version?: string; diagnostics?: Record<string, unknown>; settings?: Record<string, unknown> };
type SiteId = 'tumblr' | 'patreon' | 'x' | 'tiktok';
type SiteSettings = Record<SiteId, boolean>;

const COMMAND_EVENT = 'ultradeck:command';
const STATE_EVENT = 'ultradeck:state';
const SITE_GATE_EVENT = 'ultradeck:site-gate';
const STORAGE_KEY = 'ultradeckSettings';
const SITE_STORAGE_KEY = 'ultradeckSites';
const SITE_DEFAULTS: SiteSettings = Object.freeze({ tumblr:true, patreon:true, x:true, tiktok:true });
let sequence = 0;

function siteForHostname(hostname: string): SiteId | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'tumblr.com') return 'tumblr';
  if (host === 'patreon.com') return 'patreon';
  if (host === 'x.com' || host === 'twitter.com') return 'x';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  return null;
}

function normalizeSiteSettings(value: unknown): SiteSettings {
  const out: SiteSettings = { ...SITE_DEFAULTS };
  if (value && typeof value === 'object') {
    for (const id of Object.keys(SITE_DEFAULTS) as SiteId[]) {
      const candidate = (value as Partial<SiteSettings>)[id];
      if (typeof candidate === 'boolean') out[id] = candidate;
    }
  }
  return out;
}

export default defineContentScript({
  matches: [
    'https://www.tumblr.com/*',
    'https://www.patreon.com/*',
    'https://x.com/*',
    'https://twitter.com/*',
    'https://www.tiktok.com/*',
    'https://tiktok.com/*',
    'https://*.tiktok.com/*',
  ],
  runAt: 'document_start',
  main() {
    const site = siteForHostname(location.hostname);
    let enabled = true;
    let gateReady = false;

    function publishGate(nextEnabled: boolean) {
      enabled = nextEnabled;
      gateReady = true;
      const root = document.documentElement;
      if (root) {
        root.dataset.tuSiteEnabled = nextEnabled ? '1' : '0';
        root.dataset.tuSiteId = site || 'unknown';
      }
      document.dispatchEvent(new CustomEvent(SITE_GATE_EVENT, {
        detail: JSON.stringify({ site, enabled:nextEnabled }),
      }));
    }

    function pageCommand(type: string, value?: unknown, timeoutMs = 2500): Promise<DeckState> {
      if (gateReady && !enabled) return Promise.reject(new Error(`UltraDeck is disabled on ${site || 'this site'}.`));
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
        // Page-local settings remain authoritative if extension storage is unavailable.
      }
    }

    async function initializeGate() {
      try {
        const stored = await browser.storage.local.get(SITE_STORAGE_KEY);
        const prefs = normalizeSiteSettings(stored[SITE_STORAGE_KEY]);
        publishGate(site ? prefs[site] : false);
      } catch {
        publishGate(true);
      }
      if (enabled) void restoreSettings();
    }

    document.addEventListener(STATE_EVENT, (event) => {
      try {
        const payload = JSON.parse(String((event as CustomEvent<string>).detail || '{}')) as DeckState;
        if (payload.settings) void browser.storage.local.set({ [STORAGE_KEY]: payload.settings });
      } catch {}
    }, true);

    browser.runtime.onMessage.addListener((message: DeckMessage) => {
      if (!message || typeof message.type !== 'string') return undefined;
      if (gateReady && !enabled) return Promise.resolve({ ok:false, disabled:true, site, error:`UltraDeck is disabled on ${site || 'this site'}.` });
      return pageCommand(message.type, message.value)
        .then((payload) => ({ ok:true, payload }))
        .catch((error: Error) => ({ ok:false, error:error.message }));
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !site || !changes[SITE_STORAGE_KEY]) return;
      const prefs = normalizeSiteSettings(changes[SITE_STORAGE_KEY].newValue);
      const nextEnabled = prefs[site];
      if (!gateReady) { publishGate(nextEnabled); return; }
      if (nextEnabled === enabled) return;
      publishGate(nextEnabled);
      location.reload();
    });

    void initializeGate();
  },
});
