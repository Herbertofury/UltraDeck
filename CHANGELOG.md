# Changelog

## 8.4.0 - 2026-08-17
- Added persistent per-post interaction context on top of v8.3 Interaction Capsules.
- Reply/comment/editor drafts are captured before native synchronization and survive source-card recycling, DOM wrapper changes, and matching-control reloads within the tab session.
- Preserved expanded/thread state, menu trigger state, poll/selection state, details-open state, and compact-text expansion per retained post.
- Added signature-validated context rebinding so shifted control indexes cannot overwrite or impersonate a saved draft control.
- Kept active contextual subtrees when a virtualized native remount omits them, while still merging current native action state into the retained card.
- Added native draft synchronization recovery/retry when the source card is temporarily unavailable.
- Added session-scoped context persistence while excluding password and file-input values.
- Added a three-site destructive-remount/reload regression suite for Tumblr, Patreon, and X.
- Updated CI to current checkout/setup-python action generations and added v8.4 context invariants.
- Preserved the no-culling contract and all v8.3 native-action recovery behavior.

## 8.3.0 - 2026-08-16
- Added per-post interaction capsules so retained UltraDeck cards preserve and rebind native site controls without requiring the user to scroll back to the source post.
- Direct card actions now survive native virtualizer recycling and DOM wrapper changes across Tumblr, Patreon, X, and Twitter compatibility URLs.
- One user action is retained through bounded source restoration and automatically replayed when a recycled native source returns.
- Preserved native-backed Like, Reblog/Repost, Reply/Comment, Share, bookmark/poll/menu/input, and other captured interactive controls rather than replacing them with fake UltraDeck actions.
- Added hover/focus interaction prewarming and post-action mirror reconciliation while preserving deck scroll position.
- Reduced large-feed startup jank by scoping rail/top-chrome discovery, eliminating duplicate rail geometry reads, batching rail measurements before writes, and making repeated rail style writes idempotent.
- Removed Patreon post permalinks from top-utility discovery so retained feed cards are not mistaken for page chrome.
- Preserved the no-culling contract: all retained cards remain mounted, visible, and actionable.

## 8.2.0 - 2026-08-16
- Ported Nocturne-style jank removal principles into UltraDeck without card culling.
- Coalesced scroll processing to one frame.
- Time-sliced geometry verification around pending input.
- Rejected irrelevant Patreon/X href mutations before post identity work.
- Added cached exact source/identity resolution for Patreon and X.
- Hardened Patreon `role=article` and permalink-only feed cards.
- Hardened X identity to prefer the outer tweet timestamp and ignore quoted-status links.
- Preserved WIP-009 O(1) retained-order lookup and bounded virtualizer modeling.
