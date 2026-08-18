from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


surround = text('shared-runtime-source/surround-mode.js')
builder = text('shared-runtime-source/build_runtime.py')
bridge = text('entrypoints/bridge.content.ts')
popup = text('entrypoints/popup/main.ts')
popup_html = text('entrypoints/popup/index.html')
options = text('public/options.js')
options_html = text('public/options.html')
body = text('shared-runtime-source/ultradeck-runtime-body.js')

assert "surround-mode.js" in builder
assert "SURROUND_DEFAULTS" in bridge and "tumblr:false" in bridge.replace(' ', '')
assert "ultradeckSurroundSites" in bridge
assert "surroundMode" in bridge
assert "ultradeckSurroundSites" in popup and "id=\"surround\"" in popup_html
assert "ultradeckSurroundSites" in options
for site in ('tumblr', 'patreon', 'x', 'tiktok'):
    assert f'data-surround="{site}"' in options_html
assert "settings.surroundMode = Boolean(settings.surroundMode)" in surround
assert 'html[data-tu-surround="1"] [data-tu-native-source="1"]' in surround
assert "settings.columns = 2" in surround
assert "surroundMode = surroundEnabled()" in surround
assert "pointer-events:auto !important" in surround
assert "content-visibility" not in (body + surround).lower()
assert "state.cache.clear()" in body  # route cleanup remains explicit, not viewport culling
assert "Every retained card" not in surround  # runtime behavior, not decorative prose

print('surround contract verified')
