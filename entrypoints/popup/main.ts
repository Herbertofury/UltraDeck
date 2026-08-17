import { browser } from 'wxt/browser';
import './style.css';

type DeckState = { version?: string; site?: string; siteLabel?: string; diagnostics?: Record<string, any>; settings?: Record<string, any> };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status'), hint = $('hint'), diag = $('diag');
const columns = $<HTMLSelectElement>('columns');
for (let i = 1; i <= 20; i += 1) columns.append(new Option(String(i), String(i)));
let state: DeckState | null = null;
let timer = 0;

async function activeTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
async function command(type: string, value?: unknown) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error('No active tab');
  const response = await browser.tabs.sendMessage(tab.id, { type, value }) as { ok: boolean; payload?: DeckState; error?: string };
  if (!response?.ok) throw new Error(response?.error || 'UltraDeck bridge unavailable');
  state = response.payload || null;
  render();
  return state;
}
function render() {
  const d = state?.diagnostics || {}, s = state?.settings || {};
  $('version').textContent = state?.version ? `v${state.version}` : 'v8.1';
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
  const site = String(state?.siteLabel || d.siteLabel || state?.site || d.site || 'site');
  status.textContent = `Live · ${site}`; status.classList.add('ok'); hint.textContent = `Settings are synchronized with ${site} and extension storage.`;
}
function fail(error: unknown) {
  status.textContent = 'Not connected'; status.classList.remove('ok');
  hint.textContent = error instanceof Error ? error.message : String(error);
}
function bind(id: string, type: string, value?: () => unknown) {
  $(id).addEventListener('click', () => void command(type, value?.()).catch(fail));
}
columns.addEventListener('change', () => void command('setColumns', columns.value === 'auto' ? 'auto' : Number(columns.value)).catch(fail));
$<HTMLSelectElement>('layout').addEventListener('change', (e) => void command('setSettings', { layoutMode:(e.currentTarget as HTMLSelectElement).value }).catch(fail));
$<HTMLInputElement>('mediaOnly').addEventListener('change', (e) => void command('setSettings', { mediaOnly: (e.currentTarget as HTMLInputElement).checked }).catch(fail));
$<HTMLInputElement>('turbo').addEventListener('change', (e) => void command('setSettings', { turboMedia: (e.currentTarget as HTMLInputElement).checked }).catch(fail));
for (const id of ['minWidth','minHeight','gap']) $<HTMLInputElement>(id).addEventListener('input', () => {
  if (timer) clearTimeout(timer);
  const input = $<HTMLInputElement>(id);
  $(id+'Out').textContent = id === 'minHeight' && Number(input.value) === 0 ? 'Natural' : `${input.value}px`;
  const payload = id === 'minWidth' ? { minCardWidth:Number(input.value) }
    : id === 'minHeight' ? { minCardHeight:Number(input.value) }
    : { gap:Number(input.value) };
  timer = window.setTimeout(() => void command('setSettings', payload).catch(fail), 100);
});
bind('nav','toggleNav'); bind('extras','toggleExtras'); bind('focus','toggleFocus'); bind('sync','syncMedia'); bind('rebalance','rebalance'); bind('rescan','rescan');
void command('getState').catch(fail);
