# UltraDeck v8.4.0 verification

- Version: **8.4.0**
- Browser runtime: policy-isolated Chromium 144.0.7559.96
- Policy isolation: true; host policies modified: false

## Persistent context regression

`tests/test_v84_context_state.py` passed on Tumblr, Patreon, and X. For post 8 on each site it typed a retained reply draft, opened an expanded/thread control and menu control, selected a poll option, physically removed the native source, removed the native textarea, reset native contextual state, restored the source, and executed another native-backed action. The retained card kept all four contextual states with zero deck-scroll movement and zero interaction failures. A same-tab page reload restored the matching contextual state from session storage.

## Interaction Capsule regression

`tests/test_v83_interaction_capsules.py` passed on Tumblr, Patreon, and X. Like + Reblog/Repost + Reply/Comment + Share remained usable after native source removal and wrapper reshaping. X exercised automatic second-chance source recovery/replay. All three sites reported zero interaction failures and zero deck-scroll movement.

## Patreon/X jank regression

`tests/test_v82_jank_sites.py` passed. Patreon and X each rejected 96/96 irrelevant `href` mutations before identity work. Tumblr/Patreon/X all reported zero geometry and interaction failures and a working native Like action.

## 2,000-card retention gate

`tests/test_v74_no_cap_scale.py` passed with 2,000/2,000 retained cards, 0 hidden cards, 0 `content-visibility`, 20/20 columns, 0 geometry violations, 0 interaction failures, and a measured ready time of 2032.3 ms in that run.
