# UltraDeck v8.3.0 verification

## Runtime identity

- Version: **8.3.0**
- Browser Lab: **Chromium 144.0.7559.96**
- Browser SHA-256: `ff97800d7edd3c84350c2c8559e176ea527a94feef6cc77ccaab67b33d7558a3`
- Policy-isolated runtime: **yes**
- Host Chromium policies modified: **no**

## Per-card native interactions

A real MV3 build was exercised against Tumblr, Patreon, and X fixtures while the corresponding native source post was physically removed from the DOM and its wrapper structure was changed before restoration.

- Tumblr: Like, Reblog, Reply, Share all succeeded from the retained UltraDeck card.
- Patreon: Like, Repost, Comment/Reply, Share all succeeded from the retained UltraDeck card.
- X: Like, Repost, Reply, Share all succeeded from the retained UltraDeck card.
- Stable retained controls per exercised card: 5.
- Deck scroll delta during actions: 0 on all three sites.
- Geometry failures: 0.
- Interaction failures: 0.
- X delayed-source replay: 1 automatic retry, 1 automatic retry success from the original single user intent.

The interaction capsule stores compact control identity/state and routes through the real native site control. Raw cloned HTML is not treated as an executable substitute for site JavaScript handlers.

## Patreon/X jank regression

- 12/12 representative cards retained per site.
- 96/96 unrelated `href` mutations were rejected before post-identity processing on Patreon.
- 96/96 unrelated `href` mutations were rejected before post-identity processing on X.
- Native Like remained functional.
- Geometry failures: 0.
- Interaction failures: 0.

## 2,000-card no-culling scale gate

- Source-tree convergence run: **3252.9 ms**.
- Fresh extraction of the exact Chromium release ZIP: **3488.2 ms**.
- Retained cards: **2000/2000**.
- Hidden retained cards: **0**.
- Non-visible `content-visibility`: **0**.
- Direct/rendered columns after 20-column request: **20/20**.
- Geometry failures: **0**.
- Interaction failures: **0**.
- Long-task sample: 7 tasks / 2838 ms in this synthetic 2,000-card fixture.

Wall-clock startup varies by browser/process ordering; the release does not claim a fixed percentage speedup from a single timing sample. The function-level profile confirmed the earlier full-document left-rail/visibility scan was removed from the top startup hot paths.

## Unified extension regression

For Tumblr, Patreon, and X:

- 24/24 cards retained.
- 8 columns rendered.
- Like worked with the native source mounted.
- Like worked after the native source was removed and restored.
- Deck scroll delta: 0.
- Geometry failures: 0.
- Interaction failures: 0.

The real popup connected to X and changed columns to 6 with no popup/page errors.
