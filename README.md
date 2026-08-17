# UltraDeck v8.5.0

UltraDeck turns supported single-column social feeds into a lossless ultrawide multi-column deck for **Tumblr, Patreon, X/Twitter, and TikTok**. Every retained card stays mounted. Native-backed actions and per-post context remain usable even when the source site recycles its own feed DOM.

## TikTok in v8.5

TikTok is now a first-class UltraDeck adapter rather than a generic fallback.

- Detects TikTok feed posts from canonical `/@user/video/<id>` links, TikTok feed containers, and xgplayer identities.
- Retains working Like, Repost, Comment/Reply, Share, Favorite/Bookmark, menu, poll, permalink, and input actions through the Interaction Capsule system.
- Direct TikTok media URLs are retained as playable `<video>` elements with controls in the ultrawide card.
- Blob/MSE-only media is not blindly duplicated into a second decoder. The retained card keeps the safe media fallback and native-backed actions while UltraDeck continues tracking the native player.
- TikTok playback recovery watches both native and retained videos. On a playback error it prefers TikTok's own Retry/Try Again control, then uses bounded `HTMLMediaElement` reload/play recovery for network, decode, no-source, waiting, or stalled states.
- A visible-video watchdog detects players that stop advancing while they are expected to be playing and attempts recovery without refreshing the whole page or mass-reloading healthy videos.
- Recovery attempts are rate-limited per video so a permanently unavailable video cannot create a retry storm.

## Per-site enable/disable

The extension now has a real **Enabled sites** options page and matching quick toggles in the popup for:

- Tumblr
- Patreon
- X / Twitter
- TikTok

All sites are enabled by default. Disabling a site is a true runtime boot gate: UltraDeck does not create its deck, media accelerators, or TikTok playback hooks on that site. Changing a site's setting reloads only affected open tabs so the new state takes effect immediately.

## Persistent native interaction

Use controls directly on retained cards. Like, Reblog/Repost, Reply/Comment, Share, bookmarks, polls, menus, inputs, and other mapped controls reconnect to the site's real live controls. Active draft text, expanded/thread state, menus, poll selections, and related per-post context survive source-card recycling and same-tab reloads.

## Jank reduction without culling

UltraDeck preserves the Nocturne-style performance work from earlier releases:

- scroll storms are animation-frame coalesced;
- geometry audits are input-aware and time-sliced;
- irrelevant Patreon/X identity mutations are rejected early;
- exact source identities are cached;
- rail and top-chrome discovery is scoped before fallback scanning;
- repeated rail writes are idempotent;
- interaction metadata is captured lazily where possible;
- TikTok playback repair targets only failing/stalled media rather than restarting the feed.

## Non-negotiable retention contract

Performance is **not** achieved with viewport virtualization, card culling, hidden retained posts, `content-visibility`, quantity caps, reduced media quality, or disabled off-screen controls. Retained cards stay mounted and actionable.

## Build

```text
python3 shared-runtime-source/build_runtime.py
python3 scripts/build_portable.py
python3 scripts/package_release.py
```

## Install

See `docs/INSTALL-OPTIONS.md`. The v8.5 release contains unified Chromium and Firefox packages plus standalone Tumblr, Patreon, X, and TikTok userscripts.

## Pinterest Nocturne reference

Pinterest Nocturne 1.9.0 remains a recovered performance-design reference for jank reduction. UltraDeck applies the relevant scheduling and hot-path ideas at its own shared runtime and adapter boundaries while preserving full retention, real native actions, per-post context continuity, and video playback behavior.
