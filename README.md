# UltraDeck v8.2.0

UltraDeck turns supported single-column social feeds into a lossless ultrawide multi-column deck for **Tumblr, Patreon, X, and Twitter compatibility URLs**. It retains every captured card and native-backed interaction while removing avoidable feed jank.

## v8.2 performance pass

This release applies the same performance philosophy used by Pinterest Nocturne to the UltraDeck architecture: reject irrelevant mutation work early, coalesce scroll storms, time-slice verification work around pending input, and cache expensive site identity/source resolution.

- Patreon supports `article`, `role="article"`, post test/tag shells, and permalink-only cards without repeatedly scanning every link.
- X prefers the outer tweet timestamp permalink, ignores nested/quoted status links for identity, and caches exact retained source cards.
- Unrelated `href` churn is rejected before expensive closest-post and ID processing.
- Deck scroll metrics and buffer checks run at most once per animation frame.
- Full geometry correctness audits yield to input and run in bounded slices rather than monopolizing a long frame.
- Existing WIP-009 constant-time retained-order lookup and bounded virtualizer history sampling remain intact.

## Non-negotiable retention contract

Performance is **not** achieved with viewport virtualization, card culling, `content-visibility`, hidden retained posts, quantity caps, reduced media quality, or disabled off-screen controls. Retained cards stay mounted and actionable.

## Build

The dependency-free portable build is the canonical release path in constrained environments:

```text
python3 shared-runtime-source/build_runtime.py
python3 scripts/build_portable.py
```

The WXT project remains available for normal Node 22+ / pnpm 10+ development.

## Install

See `docs/INSTALL-OPTIONS.md`. Prebuilt Chromium/Firefox packages and standalone userscripts are under `releases/v8.2.0/`.

## Pinterest Nocturne reference

Pinterest Nocturne 1.9.0 was used as the recovered performance-design reference for this pass. UltraDeck does not vendor or copy Nocturne's site code wholesale; it applies the same class of jank-removal ideas at UltraDeck's shared runtime and adapter boundaries while preserving UltraDeck's full-retention contract.
