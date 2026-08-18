from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = Path(__file__).resolve().parent
BODY = (
    (SHARED / 'ultradeck-runtime-body.js').read_text(encoding='utf-8').rstrip()
    + '\n\n'
    + (SHARED / 'surround-mode.js').read_text(encoding='utf-8').rstrip()
    + '\n'
)
VERSION = '8.5.0'
ADAPTERS = {
    'tumblr': {
        'label': 'Tumblr',
        'file': SHARED / 'adapters/tumblr.js',
        'matches': ['https://www.tumblr.com/*'],
        'namespace': 'https://www.tumblr.com/',
    },
    'patreon': {
        'label': 'Patreon',
        'file': SHARED / 'adapters/patreon.js',
        'matches': ['https://www.patreon.com/*'],
        'namespace': 'https://www.patreon.com/',
    },
    'x': {
        'label': 'X',
        'file': SHARED / 'adapters/x.js',
        'matches': ['https://x.com/*', 'https://twitter.com/*'],
        'namespace': 'https://x.com/',
    },
    'tiktok': {
        'label': 'TikTok',
        'file': SHARED / 'adapters/tiktok.js',
        'matches': ['https://www.tiktok.com/*', 'https://tiktok.com/*', 'https://*.tiktok.com/*'],
        'namespace': 'https://www.tiktok.com/',
    },
}

def adapter_source(site: str) -> str:
    return ADAPTERS[site]['file'].read_text(encoding='utf-8').rstrip() + '\n'

release = ROOT / 'dist'
release.mkdir(parents=True, exist_ok=True)
for stale in release.glob('*-UltraWide-Deck-v*.user.js'):
    stale.unlink()

for site, info in ADAPTERS.items():
    label = info['label']
    match_lines = ''.join(f'// @match        {match}\n' for match in info['matches'])
    meta = (
        '// ==UserScript==\n'
        f'// @name         {label} UltraWide Deck\n'
        f'// @namespace    {info["namespace"]}\n'
        f'// @version      {VERSION}\n'
        f'// @description  UltraDeck v{VERSION}: lossless multi-column retained feed with native-backed off-screen interactions, HQ media, TikTok playback recovery, and shared multi-site framework.\n'
        '// @author       Bert + ChatGPT\n'
        f'{match_lines}'
        '// @run-at       document-start\n'
        '// @grant        none\n'
        '// ==/UserScript==\n\n'
    )
    filename = f'{label}-UltraWide-Deck-v{VERSION}.user.js'
    (release / filename).write_text(meta + adapter_source(site) + '(() => {\n' + BODY + '})();\n', encoding='utf-8')

# Shared runtime module used by WXT builds. Site adapter modules execute first in each site entrypoint.
runtime = ROOT / 'src/runtime/ultradeck-runtime.js'
runtime.parent.mkdir(parents=True, exist_ok=True)
runtime.write_text(
    "export function startUltraDeck() {\n"
    f"  if (globalThis.__UltraDeckExtensionRuntimeVersion === '{VERSION}') return;\n"
    "  if (!globalThis.__UltraDeckSiteAdapter) return;\n"
    f"  Object.defineProperty(globalThis, '__UltraDeckExtensionRuntimeVersion', {{ configurable:true, value:'{VERSION}' }});\n"
    + BODY + "}\n",
    encoding='utf-8',
)

adapter_out = ROOT / 'src/adapters'
adapter_out.mkdir(parents=True, exist_ok=True)
for site in ADAPTERS:
    (adapter_out / f'{site}.js').write_text(adapter_source(site), encoding='utf-8')

for browser in ('chromium-mv3', 'firefox-mv3'):
    d = ROOT / 'dist-manual' / browser
    d.mkdir(parents=True, exist_ok=True)
    (d / 'runtime-main.js').write_text(
        f"if (globalThis.__UltraDeckExtensionRuntimeVersion !== '{VERSION}' && globalThis.__UltraDeckSiteAdapter) {{\n"
        f"Object.defineProperty(globalThis, '__UltraDeckExtensionRuntimeVersion', {{ configurable:true, value:'{VERSION}' }});\n"
        "(()=>{\n" + BODY + "})();\n}\n",
        encoding='utf-8',
    )
    for site in ADAPTERS:
        (d / f'site-{site}.js').write_text(adapter_source(site), encoding='utf-8')

print('shared runtime/adapters refreshed', VERSION)
