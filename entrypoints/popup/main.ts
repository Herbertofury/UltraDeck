import { browser } from 'wxt/browser';
import './style.css';

type DeckState = { version?: string; site?: string; siteLabel?: string; diagnostics?: Record<string, any>; settings?: Record<string, any> };
type SiteId = 'tumblr' | 'patreon' | 'x' | 'tiktok';
type SiteSettings = Record<SiteId, boolean>;
const SITE_KEY = 'ultradeckSites';
const SITE_DEFAULTS: SiteSettings = Object.freeze({ tumblr:true, patreon:true, x:true, tiktok:true });
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status'), hint = $('hint'), diag = $('diag');
const columns = $<HTMLSelectElement>('columns');
for (let i = 1; i <= 20; i += 1) columns.append(new Option(String(i), String(i)));
let state: DeckState | null = null;
let sites: SiteSettings = { ...SITE_DEFAULTS };
let activeSite: SiteId | null = null;
let timer = 0;

function siteForUrl(url?: string): SiteId | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tumblr.com') return 'tumblr';
    if (host === 'patreon.com') return 'patreon';
    if (host === 'x.com' || host === 'twitter.com') return 'x';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  } catch {}
  return null;
}
function normalizeSites(value: unknown): SiteSettings {
  const out: SiteSettings = { ...SITE_DEFAULTS };
  if (value && typeof value === 'object') for (const id of Object.keys(SITE_DEFAULTS) as SiteId[]) {
    const next = (value as Partial<SiteSettings>)[id];
    if (typeof next === 'boolean') out[id] = next;
  }
  return out;
}
function setDeckControlsEnabled(enabled: boolean) {
  document.querySelectorAll<HTMLElement>('.deck-controls').forEach((section) => {
    section.classList.toggle('disabled', !enabled);
    section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button').forEach((control) => { control.disabled = !enabled; });
  });
}
function renderSiteToggles() {
  for (const id of Object.keys(SITE_DEFAULTS) as SiteId[]) $<HTMLInputElement>(`site-${id}`).checked = sites[id];
}
async function activeTab() {
  const tabs = await browser.tabs.query({ active:true, currentWindow:true });
  return tabs[0];
}
async function command(type: string, value?: unknown) {
  if (activeSite && !sites[activeSite]) throw new Error(`UltraDeck is disabled on ${activeSite}.`);
  const tab = await activeTab();
  if (!tab?.id) throw new Error('No active tab');
  const response = await browser.tabs.sendMessage(tab.id, { type, value }) as { ok:boolean; disabled?:boolean; site?:string; payload?:DeckState; error?:string };
  if (!response?.ok) throw new Error(response?.error || 'UltraDeck bridge unavailable');
  state = response.payload || null;
  render();
  return state;
}
function render() {
  const d = state?.diagnostics || {}, s = state?.settings || {};
  $('version').textContent = state?.version ? `v${state.version}` : 'v8.5.0';
  $('posts').textContent = String(d.cachedPosts ?? d.posts ?? 0);
  $('cols').textContent = String(d.renderedColumns ?? d.columns ?? 0);
  $('media').textContent = String(d.mediaQualityReady ?? d.media?.qualityReady ?? 0);
  columns.value = String(s.columns ?? 'auto');
  $<HTMLSelectElement>('layout').value = String(s.layoutMode ?? 'masonry');
  $<HTMLInputElement>('mediaOnly').checked = Boolean(s.mediaOnly ?? false);
  $<HTMLInputElement>('turbo').checked = Boolean(s.turboMedia ?? true);
  $<HTMLInputElement>('minWidth').value = String(s.minCardWidth ?? 320);
  $('minWidthOut').textContent = `${s.minCardWidth ?? 320}px`;
  $<HTMLInputElement>('minHeight').value = String(s.minCardHeight ?? 0);
  $('minHeightOut').textContent = Number(s.minCardHeight ?? 0) ? `${s.minCardHeight}px` : 'Natural';
  $<HTMLInputElement>('gap').value = String(s.gap ?? 16);
  $('gapOut').textContent = `${s.gap ?? 16}px`;
  diag.textContent = JSON.stringify(d, null, 2);
  const label = String(state?.siteLabel || d.siteLabel || state?.site || d.site || activeSite || 'site');
  status.textContent = `Live · ${label}`;
  status.classList.add('ok');
  status.classList.remove('disabled-status');
  hint.textContent = `Settings are synchronized with ${label} and extension storage.`;
  setDeckControlsEnabled(true);
}
function renderDisabled(site: SiteId) {
  state = null;
  $('posts').textContent = '0'; $('cols').textContent = '0'; $('media').textContent = '0'; diag.textContent = '{}';
  const siteLabel: Record<SiteId,string> = { tumblr:'Tumblr', patreon:'Patreon', x:'X', tiktok:'TikTok' };
  status.textContent = `Disabled · ${siteLabel[site]}`;
  status.classList.remove('ok'); status.classList.add('disabled-status');
  hint.textContent = 'Enable this site above to reload the active tab with UltraDeck.';
  setDeckControlsEnabled(false);
}
function fail(error: unknown) {
  status.textContent = activeSite ? 'Not connected' : 'Unsupported tab';
  status.classList.remove('ok', 'disabled-status');
  hint.textContent = error instanceof Error ? error.message : String(error);
  setDeckControlsEnabled(Boolean(activeSite && sites[activeSite]));
}
function bind(id: string, type: string, value?: () => unknown) { $(id).addEventListener('click', () => void command(type, value?.()).catch(fail)); }

columns.addEventListener('change', () => void command('setColumns', columns.value === 'auto' ? 'auto' : Number(columns.value)).catch(fail));
$<HTMLSelectElement>('layout').addEventListener('change', (e) => void command('setSettings', { layoutMode:(e.currentTarget as HTMLSelectElement).value }).catch(fail));
$<HTMLInputElement>('mediaOnly').addEventListener('change', (e) => void command('setSettings', { mediaOnly:(e.currentTarget as HTMLInputElement).checked }).catch(fail));
$<HTMLInputElement>('turbo').addEventListener('change', (e) => void command('setSettings', { turboMedia:(e.currentTarget as HTMLInputElement).checked }).catch(fail));
for (const id of ['minWidth','minHeight','gap']) $<HTMLInputElement>(id).addEventListener('input', () => {
  if (timer) clearTimeout(timer);
  const input = $<HTMLInputElement>(id);
  $(id+'Out').textContent = id === 'minHeight' && Number(input.value) === 0 ? 'Natural' : `${input.value}px`;
  const payload = id === 'minWidth' ? { minCardWidth:Number(input.value) } : id === 'minHeight' ? { minCardHeight:Number(input.value) } : { gap:Number(input.value) };
  timer = window.setTimeout(() => void command('setSettings', payload).catch(fail), 100);
});
for (const id of Object.keys(SITE_DEFAULTS) as SiteId[]) $<HTMLInputElement>(`site-${id}`).addEventListener('change', async (event) => {
  const checked = (event.currentTarget as HTMLInputElement).checked;
  sites = { ...sites, [id]:checked };
  await browser.storage.local.set({ [SITE_KEY]:sites });
  if (activeSite === id) {
    if (checked) { status.textContent = 'Reloading'; hint.textContent = 'UltraDeck is enabling on this tab…'; setDeckControlsEnabled(false); }
    else renderDisabled(id);
  }
});
$('openOptions').addEventListener('click', () => void browser.runtime.openOptionsPage());
bind('nav','toggleNav'); bind('extras','toggleExtras'); bind('focus','toggleFocus'); bind('sync','syncMedia'); bind('rebalance','rebalance'); bind('rescan','rescan');

async function init() {
  const [stored, tab] = await Promise.all([browser.storage.local.get(SITE_KEY), activeTab()]);
  sites = normalizeSites(stored[SITE_KEY]);
  renderSiteToggles();
  activeSite = siteForUrl(tab?.url);
  if (!activeSite) { fail(new Error('Open Tumblr, Patreon, X, or TikTok in the active tab.')); return; }
  if (!sites[activeSite]) { renderDisabled(activeSite); return; }
  await command('getState');
}
void init().catch(fail);
