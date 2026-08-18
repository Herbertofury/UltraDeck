from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
assert VERSION == '8.6.0'

loader = (ROOT / 'src/extension/site-runtime-loader.ts').read_text()
assert "from 'wxt/utils/inject-script'" in loader
assert 'MutationObserver' in loader
assert 'isChallengePage' in loader
assert 'challenges.cloudflare.com' in loader
assert 'SITE_STORAGE_KEY' in loader
for site in ('tumblr','patreon','x','tiktok'):
    text = (ROOT / f'entrypoints/{site}-main.content.ts').read_text()
    assert "world: 'ISOLATED'" in text
    assert 'noScriptStartedPostMessage: true' in text
    assert 'startSiteRuntime' in text
    main_world = (ROOT / f'entrypoints/{site}-main-world.ts').read_text()
    assert 'defineUnlistedScript' in main_world
    assert 'startUltraDeck' in main_world

bridge = (ROOT / 'entrypoints/bridge.content.ts').read_text()
assert 'waitForXApplication' in bridge
assert 'isChallengePage' in bridge
assert 'ultradeckSurroundSites' in bridge

hardening = (ROOT / 'shared-runtime-source/site-hardening.js').read_text()
assert 'maxDeckTop' in hardening
assert 'resolveDeckTopHardened' in hardening

tumblr = (ROOT / 'shared-runtime-source/adapters/tumblr.js').read_text()
x = (ROOT / 'shared-runtime-source/adapters/x.js').read_text()
patreon = (ROOT / 'shared-runtime-source/adapters/patreon.js').read_text()
assert 'maxDeckTop: 154' in tumblr
assert 'maxDeckTop:132' in x or 'maxDeckTop: 132' in x
assert 'version: 3' in patreon
assert 'maxDeckTop: 156' in patreon
assert '[data-testid*="post"' not in patreon
assert "return direct || link.parentElement" not in patreon

build = (ROOT / 'shared-runtime-source/build_runtime.py').read_text()
assert "'site-hardening.js', 'surround-mode.js'" in build
assert 'queueMicrotask(() => void boot())' in build

portable = (ROOT / 'scripts/build_portable.py').read_text()
assert "'world': 'MAIN'" not in portable
assert "'site-loader.js'" in portable
assert 'web_accessible_resources' in portable
assert 'challenge-platform' in portable
print('site regression contract passed', VERSION)
