# UltraDeck + Pinterest Nocturne recovery repository

This repository is the durable publication point for the newest recovered **UltraDeck** and **Pinterest Nocturne** project states found during the 2026-08-15 recovery pass.

## UltraDeck v8.1.0

UltraDeck is a lossless ultrawide multi-column feed engine for **Tumblr, Patreon, X, and the Twitter compatibility hostname**. The v8.1.0 source here was reconstructed from the exact verified v8.0.0 source plus the newest recovered **v8.1.0 WIP-009 Prepackage Source Patch**, then hardened further for current Patreon and X feed semantics.

Current hardening includes:

- selected top-level feed/tab state in route identity so same-URL feed switches do not mix retained histories
- X timestamp-permalink identity so quoted/referenced status links do not steal the outer Post ID
- X exact-ID source restoration across every matching status link
- Patreon semantic `role="article"` support plus permalink-derived identity fallback
- expanded Patreon Share / Reshare / Repost and X Reply / Repost / Bookmark / Share / More native-action coverage
- preserved off-screen native-control restoration without moving the visible UltraDeck deck
- preserved no-culling contract: no viewport virtualization, hidden retained cards, `content-visibility`, or quantity cap

### UltraDeck downloads

- [Complete v8.1.0 source](releases/UltraDeck-v8.1.0-source.zip)
- [Chromium MV3](releases/UltraDeck-Extension-v8.1.0-chromium-mv3.zip)
- [Firefox MV3](releases/UltraDeck-Extension-v8.1.0-firefox-mv3.zip)
- [Patreon userscript](releases/Patreon-UltraWide-Deck-v8.1.0.user.js)
- [X / Twitter userscript](releases/X-UltraWide-Deck-v8.1.0.user.js)
- [Tumblr userscript](releases/Tumblr-UltraWide-Deck-v8.1.0.user.js)
- [Recovered WIP-009 patch](releases/UltraDeck-v8.1.0-WIP-009-Prepackage-Source-Patch.txt)

The complete source archive contains the WXT/TypeScript shell, portable builder, shared runtime, all three adapters, current research notes, regression fixtures and performance tests. Extract it before development.

## Pinterest Nocturne v1.9.0

The published source is the newest substantively distinct connected-Drive v1.9.0 candidate recovered on 2026-08-12. It is preserved byte-for-byte as recovered.

### Pinterest Nocturne downloads

- [Exact recovered v1.9.0 source](releases/Pinterest-Nocturne-1.9.0-Source.zip)
- [Chromium build](releases/pinterest-nocturne-1.9.0-chromium.zip)
- [Firefox build](releases/pinterest-nocturne-1.9.0-firefox.zip)

## Verification

See [VERIFICATION.md](VERIFICATION.md) for the current-run evidence and its exact boundary. File sizes and SHA-256 hashes are in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json) and [SHA256SUMS.txt](releases/SHA256SUMS.txt).

## Current platform references used for UltraDeck hardening

- Patreon: https://support.patreon.com/hc/en-us/articles/360039998431-How-to-find-a-creator-s-posts-and-Quips
- Patreon Quips: https://support.patreon.com/hc/en-us/articles/39299791825293-Sharing-Quips
- Patreon creator pages: https://support.patreon.com/hc/en-us/articles/36972391815693-Your-updated-creator-page
- X timelines: https://help.x.com/en/using-x/x-timeline
- X developer timelines: https://docs.x.com/x-api/posts/timelines/integrate
- Current X semantic-selector reference: https://github.com/insin/control-panel-for-twitter
