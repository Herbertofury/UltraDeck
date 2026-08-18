import { browser } from 'wxt/browser';
import { isChallengePage } from '../src/extension/site-runtime-loader';

type DeckMessage = { type: string; value?: unknown; requestId?: string };
type DeckState = { requestId?: string; version?: string; diagnostics?: Record<string, unknown>; settings?: Record<string, unknown> };
type SiteId = 'tumblr' | 'patreon' | 'x' | 'tiktok';
type SiteSettings = Record<SiteId, boolean>;

const COMMAND_EVENT = 'ultradeck:command';
const STATE_EVENT = 'ultradeck:state';
const SITE_GATE_EVENT = 'ultradeck:site-gate';
const STORAGE_KEY = 'ultradeckSettings';
const SITE_STORAGE_KEY = 'ultradeckSites';
const SURROUND_SITE_KEY = 'ultradeckSurroundSites';
const SITE_DEFAULTS: SiteSettings = Object.freeze({ tumblr:true, patreon:true, x:true, tiktok:true });
const SURROUND_DEFAULTS: SiteSettings = Object.freeze({ tumblr:false, patreon:false, x:false, tiktok:false });
let sequence = 0;

function siteForHostname(hostname: string): SiteId | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'tumblr.com') return 'tumblr';
  if (host === 'patreon.com') return 'patreon';
  if (host === 'x.com' || host === 'twitter.com') return 'x';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  return null;
}

function normalizeSettings(value: unknown, defaults: SiteSettings): SiteSettings {
  const out: SiteSettings = { ...defaults };
  if (value && typeof value === 'object') {
    for (const id of Object.keys(defaults) as SiteId[]) {
      const candidate = (value as Partial<SiteSettings>)[id];
      if (typeof candidate === 'boolean') out[id] = candidate;
    }
  }
  return out;
}
const normalizeSiteSettings = (value: unknown) => normalizeSettings(value, SITE_DEFAULTS);
const normalizeSurroundSettings = (value: unknown) => normalizeSettings(value, SURROUND_DEFAULTS);

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
  noScriptStartedPostMessage: true,
  main() {
    const site = siteForHostname(location.hostname);
    if (site === 'x' && isChallengePage()) return;

    let enabled = true;
    let gateReady = false;

    function challengeActive() { return site === 'x' && isChallengePage(); }

    async function waitForXApplication(): Promise<boolean> {
      if (site !== 'x') return true;
      const appEvidence = () => Boolean(document.querySelector('#react-root,[data-testid="primaryColumn"],main[role="main"]'));
      if (challengeActive()) return false;
      if (appEvidence()) return true;
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        let observer: MutationObserver | null = null;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          observer?.disconnect();
          resolve(value);
        };
        const inspect = () => {
          if (challengeActive()) return finish(false);
          if (appEvidence()) return finish(true);
          if (document.readyState === 'complete') window.setTimeout(() => finish(false), 1200);
        };
        observer = new MutationObserver(inspect);
        if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true });
        document.addEventListener('readystatechange', inspect, { passive:true });
        window.setTimeout(() => finish(false), 15_000);
        inspect();
      });
    }

    function publishGate(nextEnabled: boolean) {
      if (challengeActive()) return;
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
      if (challengeActive()) return Promise.reject(new Error('UltraDeck is inactive on the X verification page.'));
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
      if (challengeActive()) return;
      try {
        const [generalStored, surroundStored] = await Promise.all([
          browser.storage.local.get(STORAGE_KEY),
          browser.storage.local.get(SURROUND_SITE_KEY),
        ]);
        const generalValue = generalStored[STORAGE_KEY];
        const general = generalValue && typeof generalValue === 'object' ? { ...(generalValue as Record<string, unknown>) } : {};
        const surround = normalizeSurroundSettings(surroundStored[SURROUND_SITE_KEY]);
        await pageCommand('setSettings', { ...general, surroundMode:site ? surround[site] : false }, 5000);
      } catch {}
    }

    async function initializeGate() {
      if (!(await waitForXApplication()) || challengeActive()) return;
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
      if (challengeActive()) return;
      try {
        const payload = JSON.parse(String((event as CustomEvent<string>).detail || '{}')) as DeckState;
        if (!payload.settings) return;
        const { surroundMode, ...general } = payload.settings as Record<string, unknown>;
        void browser.storage.local.set({ [STORAGE_KEY]: general });
        if (site && typeof surroundMode === 'boolean') {
          void browser.storage.local.get(SURROUND_SITE_KEY).then((stored) => {
            const surround = normalizeSurroundSettings(stored[SURROUND_SITE_KEY]);
            if (surround[site] === surroundMode) return;
            surround[site] = surroundMode;
            return browser.storage.local.set({ [SURROUND_SITE_KEY]: surround });
          });
        }
      } catch {}
    }, true);

    browser.runtime.onMessage.addListener((message: DeckMessage) => {
      if (!message || typeof message.type !== 'string') return undefined;
      if (challengeActive()) return Promise.resolve({ ok:false, challenge:true, site, error:'UltraDeck is inactive on the X verification page.' });
      if (gateReady && !enabled) return Promise.resolve({ ok:false, disabled:true, site, error:`UltraDeck is disabled on ${site || 'this site'}.` });
      return pageCommand(message.type, message.value)
        .then((payload) => ({ ok:true, payload }))
        .catch((error: Error) => ({ ok:false, error:error.message }));
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (challengeActive() || areaName !== 'local' || !site) return;
      if (changes[SITE_STORAGE_KEY]) {
        const prefs = normalizeSiteSettings(changes[SITE_STORAGE_KEY].newValue);
        const nextEnabled = prefs[site];
        if (!gateReady) { publishGate(nextEnabled); return; }
        if (nextEnabled !== enabled) {
          publishGate(nextEnabled);
          location.reload();
          return;
        }
      }
      if (enabled && changes[SURROUND_SITE_KEY]) {
        const surround = normalizeSurroundSettings(changes[SURROUND_SITE_KEY].newValue);
        void pageCommand('setSettings', { surroundMode:surround[site] }, 5000).catch(() => {});
      }
    });

    void initializeGate();
  },
});
