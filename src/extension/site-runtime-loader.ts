import { browser } from 'wxt/browser';
import { injectScript } from 'wxt/utils/inject-script';

export type UltraDeckSiteId = 'tumblr' | 'patreon' | 'x' | 'tiktok';

type ContentContext = {
  isValid: boolean;
  setTimeout(callback: () => void, delay?: number): number;
};

type SiteRuntimeConfig = {
  script: string;
  evidence: readonly string[];
  fallbackDelayMs: number;
};

const SITE_STORAGE_KEY = 'ultradeckSites';
const SITE_DEFAULTS: Record<UltraDeckSiteId, boolean> = Object.freeze({
  tumblr: true,
  patreon: true,
  x: true,
  tiktok: true,
});

const SITE_RUNTIME: Record<UltraDeckSiteId, SiteRuntimeConfig> = Object.freeze({
  tumblr: { script: '/tumblr-main-world.js', evidence: ['[data-timeline]', '[data-timeline-id]', 'main'], fallbackDelayMs: 1800 },
  patreon: { script: '/patreon-main-world.js', evidence: ['main', '[role="main"]', 'a[href*="/posts/"]'], fallbackDelayMs: 1800 },
  x: { script: '/x-main-world.js', evidence: ['#react-root', '[data-testid="primaryColumn"]', 'main[role="main"]'], fallbackDelayMs: 2600 },
  tiktok: { script: '/tiktok-main-world.js', evidence: ['#app', '[data-e2e="recommend-list"]', 'main'], fallbackDelayMs: 2200 },
});

const CHALLENGE_SELECTOR = [
  '#challenge-running',
  '#cf-chl-widget',
  '[data-cf-challenge]',
  'iframe[src*="challenges.cloudflare.com"]',
  'script[src*="/cdn-cgi/challenge-platform/"]',
].join(',');

export function isChallengePage(): boolean {
  const title = String(document.title || '').trim().toLowerCase();
  if (/just a moment|checking your browser|verify you are human|security verification|attention required/.test(title)) return true;
  if (location.pathname.startsWith('/cdn-cgi/')) return true;
  try { return Boolean(document.querySelector(CHALLENGE_SELECTOR)); } catch { return false; }
}

function normalizeSiteSettings(value: unknown): Record<UltraDeckSiteId, boolean> {
  const out = { ...SITE_DEFAULTS };
  if (value && typeof value === 'object') {
    for (const site of Object.keys(SITE_DEFAULTS) as UltraDeckSiteId[]) {
      const candidate = (value as Partial<Record<UltraDeckSiteId, boolean>>)[site];
      if (typeof candidate === 'boolean') out[site] = candidate;
    }
  }
  return out;
}

async function siteEnabled(site: UltraDeckSiteId): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(SITE_STORAGE_KEY);
    return normalizeSiteSettings(stored[SITE_STORAGE_KEY])[site];
  } catch {
    return true;
  }
}

function hasEvidence(config: SiteRuntimeConfig): boolean {
  for (const selector of config.evidence) {
    try { if (document.querySelector(selector)) return true; } catch { /* ignore malformed upstream DOM */ }
  }
  return false;
}

async function waitForSafeDocument(ctx: ContentContext, site: UltraDeckSiteId, config: SiteRuntimeConfig): Promise<boolean> {
  const started = performance.now();
  const timeoutMs = 15_000;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let observer: MutationObserver | null = null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      observer = null;
      resolve(value);
    };
    const inspect = () => {
      if (!ctx.isValid) return finish(false);
      if (isChallengePage()) return finish(false);
      if (hasEvidence(config)) return finish(true);
      const elapsed = performance.now() - started;
      if (elapsed >= timeoutMs) return finish(site !== 'x' && document.readyState !== 'loading');
      if (elapsed >= config.fallbackDelayMs && document.readyState !== 'loading' && document.body) return finish(true);
    };
    observer = new MutationObserver(inspect);
    const root = document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true });
    document.addEventListener('readystatechange', inspect, { passive: true });
    ctx.setTimeout(inspect, config.fallbackDelayMs);
    ctx.setTimeout(inspect, timeoutMs);
    inspect();
  });
}

export async function startSiteRuntime(ctx: ContentContext, site: UltraDeckSiteId): Promise<void> {
  if (!(await siteEnabled(site)) || !ctx.isValid) return;
  const config = SITE_RUNTIME[site];
  const safe = await waitForSafeDocument(ctx, site, config);
  if (!safe || !ctx.isValid || isChallengePage()) return;
  await injectScript(config.script, { keepInDom: false });
}
