# UltraDeck v8.4.0

UltraDeck turns supported single-column social feeds into a lossless ultrawide multi-column deck for **Tumblr, Patreon, X, and Twitter compatibility URLs**. Every captured card stays mounted in the UltraDeck feed. v8.4 extends the native-backed Interaction Capsule system with persistent per-post contextual state so a recycled source card cannot erase what the user was doing.

## v8.4 persistent post context

UltraDeck now keeps active interaction context attached to the retained post instead of treating a cloned card as disposable HTML.

- Reply/comment/editor draft values are captured immediately on `input`/`change` before any native-source recovery is attempted.
- Drafts survive native virtualizer recycling and framework wrapper changes.
- If a native remount removes an active contextual subtree such as an inline composer, UltraDeck keeps the retained subtree rather than replacing it with the incomplete remount.
- Expanded/thread controls preserve `aria-expanded`, selected controls preserve `aria-selected`/`aria-checked`, polls preserve checked state, `<details>` keeps its open state, and common `data-state` open/active states are retained.
- Menu trigger state is retained instead of being reset by source recycling.
- Compact-text expansion is retained per post.
- Active context is mirrored into `sessionStorage`, so matching contextual controls are restored after a same-tab reload or SPA navigation.
- Password and file-input values are never captured into the context store.
- A native submit/cancel/close action clears retained draft state instead of resurrecting an already-sent or discarded draft.
- Input synchronization has the same hidden source-recovery/retry path as button actions, so a temporarily recycled source does not make the user retype the draft.

Raw saved HTML is deliberately not the source of truth. HTML cannot preserve React/framework handlers. UltraDeck stores compact control identity and context, then reconnects it to the site's real live control when an action must execute.

## Interaction Capsules

Use controls directly on the UltraDeck card. Like, Reblog/Repost, Reply/Comment, Share, bookmarks, polls, menus, inputs, and other retained controls reconnect to the matching native control in the background. If the site's virtualizer recycled the source post, UltraDeck silently restores it, rebinds the saved control even when wrapper DOM changed, and automatically replays the original intent. The deck scroll position stays fixed.

## Jank reduction without culling

UltraDeck keeps the Nocturne-style jank-removal work from v8.2/v8.3 while preserving every retained card:

- scroll storms are animation-frame coalesced;
- geometry audits are input-aware and time-sliced;
- Patreon/X irrelevant `href` mutations are rejected before identity work;
- Patreon/X exact source identities are cached;
- rail and top-chrome discovery are scoped to semantic roots before fallbacks;
- duplicate rail geometry reads and read/write/read layout chains are avoided;
- repeated rail style writes are idempotent;
- Patreon post permalinks are excluded from top-toolbar discovery;
- contextual state capture is event-driven, not an eager per-card startup scan.

## Non-negotiable retention contract

Performance is **not** achieved with viewport virtualization, card culling, `content-visibility`, hidden retained posts, quantity caps, reduced media quality, or disabled off-screen controls. Retained cards stay mounted and actionable.

## Build

```text
python3 shared-runtime-source/build_runtime.py
python3 scripts/build_portable.py
```

## Install

See `docs/INSTALL-OPTIONS.md`. Prebuilt Chromium/Firefox packages and standalone userscripts are published under `releases/v8.4.0/` and the GitHub v8.4.0 release.

## Pinterest Nocturne reference

Pinterest Nocturne 1.9.0 remains the recovered performance-design reference for the jank-removal approach. UltraDeck applies those ideas at its own shared runtime/adapter boundaries while preserving full retention, real native actions, and per-post context continuity.
