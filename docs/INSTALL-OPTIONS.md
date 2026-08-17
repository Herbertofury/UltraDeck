# UltraDeck v8.4.0 install options

## Unified Chromium-family extension

Extract `UltraDeck-Extension-v8.4.0-chromium-mv3.zip`, then load the extracted folder as an unpacked MV3 extension. One package supports Tumblr, Patreon, X, and the Twitter compatibility hostname.

## Unified Firefox extension

Extract `UltraDeck-Extension-v8.4.0-firefox-mv3.zip` and load it through Firefox extension tooling. The package preserves the existing UltraDeck Gecko ID and Firefox 128 minimum version.

## Standalone userscripts

- `Tumblr-UltraWide-Deck-v8.4.0.user.js` for `https://www.tumblr.com/*`
- `Patreon-UltraWide-Deck-v8.4.0.user.js` for `https://www.patreon.com/*`
- `X-UltraWide-Deck-v8.4.0.user.js` for `https://x.com/*` and `https://twitter.com/*`

Each userscript embeds the same shared v8.4 runtime plus its site adapter.

## Interaction and context behavior

Use controls directly on the retained UltraDeck card. Native-backed actions restore/rebind recycled source posts in the background. v8.4 also retains active draft text, expanded/thread state, menu trigger state, polls/selections, details-open state, and matching contextual controls across source recycling and same-tab reloads. Password/file-input values are excluded from retained context.
