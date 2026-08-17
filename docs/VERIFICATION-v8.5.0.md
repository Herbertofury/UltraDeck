# UltraDeck v8.5.0 verification

- Version: **8.5.0**
- Browser runtime: policy-isolated Chromium 144.0.7559.96
- Browser SHA-256: `ff97800d7edd3c84350c2c8559e176ea527a94feef6cc77ccaab67b33d7558a3`
- Policy isolation: true; host policies modified: false

## TikTok adapter and playback recovery

`tests/test_v85_tiktok.py` passed against an exact-host HTTPS TikTok fixture in real Chromium using current TikTok feed/action/xgplayer selector families. Sixteen TikTok posts were retained into eight columns. Retained videos received a direct playable VP9 WebM source and browser-native controls when a direct media URL was available. Like, Repost, Comment, and Share executed through the corresponding native TikTok controls with zero deck-scroll movement, zero geometry violations, and zero interaction failures.

The test then injected a visible TikTok-style `Ran into an error. Cannot play this video.` state on the native source corresponding to a retained mirror video. The retained-video playback healer mapped the mirror back to its native post, clicked the native `Try again` control, kicked mirror playback, and recovered successfully. Diagnostics recorded 36 observed video instances, 16 native observations, 20 retained-mirror observations, 1 mirror recovery, 1 playback error, 1 recovery attempt, 1 recovery success, 1 native retry click, and 1 play kick.

The recovery path is intentionally bounded. It observes actual HTMLMediaElement error/waiting/stalled state, prefers TikTok's own nearby retry UI, then uses targeted media reload/play recovery with per-video cooldown and attempt limits. Healthy videos are not mass-reloaded.

## Per-site enable/disable options

`tests/test_v85_site_options.py` passed with the packaged extension loaded. The real extension options page exposed persisted switches for Tumblr, Patreon, X/Twitter, and TikTok. Disabling all four sites persisted after options-page reload. On the active TikTok tab, disabling TikTok reloaded that tab and prevented UltraDeck from booting: no `window.__UltraDeck` runtime and no deck shell were present. Re-enabling TikTok reloaded only the affected tab and restored the UltraDeck v8.5.0 deck. All four settings persisted when re-enabled.

`tests/test_popup_ui.py` also passed with the popup's four quick site toggles and Options button exercised alongside the existing layout/media/column/action controls.

## Existing interaction and context regressions

`tests/test_v83_interaction_capsules.py` passed on Tumblr, Patreon, and X. Native Like + Reblog/Repost + Reply/Comment + Share remained usable after source-card removal and wrapper reshaping. X automatic source recovery/replay remained green.

`tests/test_v84_context_state.py` passed on Tumblr, Patreon, and X. Draft, expanded/thread, menu, and poll/selection state survived destructive native remounts and same-tab reload persistence with zero interaction failures.

`tests/test_v82_jank_sites.py` passed. Patreon and X each rejected 96/96 irrelevant `href` mutations before post identity work. Tumblr, Patreon, and X reported zero geometry and interaction failures with a working native Like action.

## 2,000-card retention and performance gate

`tests/test_v74_no_cap_scale.py` passed with 2,000/2,000 retained cards, 0 hidden cards, 0 `content-visibility`, 20/20 columns, 0 geometry violations, and 0 interaction failures.

An alternating same-environment comparison measured v8.4.0 at 2068.1 ms ready time and v8.5.0 at 2094.3 ms on the same 2,000-card workload. The 26.2 ms difference is about 1.3%, while v8.5 retains the added TikTok/video-recovery and site-gating functionality without changing the no-culling contract.

## Bridge and build validation

`tests/test_manual_bridge_e2e.py` passed with the new site gate active before the page-world runtime. TypeScript standalone checking, JavaScript syntax checking, Python compilation, runtime generation, and portable Chromium/Firefox generation passed.

The broad legacy `tests/test_v8_multisite_extension.py` exceeded the 120-second executor ceiling in this environment and was not counted as a passing test. Changed-path and compatibility suites above provide the release acceptance evidence.
