# UltraDeck v8.5.0 install options

## Unified Chromium-family extension

Extract `UltraDeck-Extension-v8.5.0-chromium-mv3.zip`, then load the extracted folder as an unpacked MV3 extension. One package supports Tumblr, Patreon, X/Twitter, and TikTok.

Open **UltraDeck > Options** to enable or disable each supported site independently. The same four switches are available in the popup for quick access.

## Unified Firefox extension

Extract `UltraDeck-Extension-v8.5.0-firefox-mv3.zip` and load it through Firefox extension tooling. The package preserves the existing UltraDeck Gecko ID and Firefox 128 minimum version.

## Standalone userscripts

- `Tumblr-UltraWide-Deck-v8.5.0.user.js` for `https://www.tumblr.com/*`
- `Patreon-UltraWide-Deck-v8.5.0.user.js` for `https://www.patreon.com/*`
- `X-UltraWide-Deck-v8.5.0.user.js` for `https://x.com/*` and `https://twitter.com/*`
- `TikTok-UltraWide-Deck-v8.5.0.user.js` for TikTok web feeds

Each userscript embeds the shared v8.5 runtime plus its site adapter. The extension-only Enabled Sites switches do not govern standalone userscripts.

## TikTok playback behavior

UltraDeck keeps direct TikTok media URLs playable on retained cards and installs bounded playback recovery. A failing player first uses a nearby TikTok Retry/Try Again action when available. Otherwise UltraDeck attempts targeted media reload/play recovery for recoverable media states and uses a stuck-playback watchdog. Healthy videos are not mass-reloaded.

## Interaction and context behavior

Use controls directly on retained UltraDeck cards. Native-backed actions restore and rebind recycled source posts in the background. Draft text, expanded/thread state, menu state, polls/selections, details-open state, and matching contextual controls continue to survive source recycling and same-tab reloads.
