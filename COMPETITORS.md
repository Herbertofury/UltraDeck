# Competing apps and comparable interfaces
Source review: **2026-11-12**.

UltraDeck is an in-site ultrawide feed enhancement, not a universal replacement social network client. Compare both native site behavior and adjacent tools without claiming their platform coverage is identical.

| Reference | Source-backed scope | Lesson and experiment |
| --- | --- | --- |
| [XKit Rewritten](https://github.com/AprilSylph/XKit-Rewritten) | Enhancement suite for Tumblr's web interface | Test coexistence, accessibility, site-change resilience and clear per-feature controls. |
| [Mastodon advanced interface](https://docs.joinmastodon.org/user/preferences/) | Configurable multi-column interface | Compare density, column navigation, keyboard flow and readable width as UX references, not Tumblr/Patreon/X/TikTok adapters. |
| Native Tumblr, Patreon, X and TikTok interfaces | Applicable site's own live UI | Correctness oracle for actions, drafts, menus, comments and media state; only test through permitted sessions. |

The [Mastodon 5.0 announcement](https://blog.joinmastodon.org/2026/08/5.0-laying-the-foundation/) is a dated official design-change reference. It is not a performance result for UltraDeck. deck.blue was considered but its site returned access failure during this review; no feature claims are based on it.

## Backlog and non-negotiable acceptance
- [ ] Compare actual actionable cards per viewport at several monitor widths and zoom levels.
- [ ] Measure input/scroll p95 latency, memory growth and media decoder count during a long retained-feed session.
- [ ] Test reply drafts, selection, menus, polls and focus after native source-card recycling.
- [ ] Exercise per-site disable, navigation, reload and failing media recovery without duplicate submissions.
- [ ] Preserve the [retention contract](README.md#non-negotiable-retention-contract): no card culling, hidden retained posts, quantity caps, quality reduction or disabled off-screen actions to manufacture a speed result.
- [ ] Separate reproducible user friction from opinion; prototype width/density improvements without removing existing controls.

## Evidence and refresh rules
Review official release notes, documentation and issue trackers daily when the scheduled review runs. Record the source URL, check date, version/commit, relevant change, user impact and next experiment; retain last-good information and mark inaccessible sources. No change is a valid result. A scheduled review is not continuous monitoring.

This is a source-backed research shortlist, **not a head-to-head benchmark or a claim of feature/performance superiority**. Before recommending adoption, compare the current application and candidate on the same real workloads, machine, versions and correctness requirements. Retain raw timings, p50/p95 latency, CPU/memory, failures and rollback evidence. Check licensing and privacy before reuse; an open repository does not grant unrestricted reuse. New features remain proposals until approved, implemented and accepted.


## Foundations, reusable techniques and own-project connections
Added **2026-11-12**. Preserve the existing runtime/adapter ownership and full-retention contract.

| Candidate / reuse mode | Concrete technique | Gate / intended improvement |
| --- | --- | --- |
| [XKit Rewritten](https://github.com/AprilSylph/XKit-Rewritten), compatibility/reference suite | Modular Tumblr enhancements and native-interface coexistence | Review exact source/license before reuse; prove simultaneous controls and draft/focus integrity |
| [Mastodon](https://docs.joinmastodon.org/user/preferences/), behavior reference | Multi-column navigation and configurable information density | Reimplement appropriate interactions, not assume its API or renderer fits third-party sites |
| Existing shared-runtime-source and site adapters | Stable card identities, native-action reconnection and bounded recovery | Extend tested shared runtime rather than proliferate near-duplicate userscripts |

**Interoperation proposals:** [MediaForge](https://github.com/Herbertofury/MediaForge) could share pure media identity/capability schemas and classification fixtures. MediaForge's viewport strategies must **not** be imported where they violate UltraDeck retention. [Ferrum](https://github.com/Herbertofury/Ferrum-Browser) could host repeatable extension coexistence, keyboard/draft preservation and exact-artifact tests. Keep site sessions and playback control inside their owning application; metadata exchange is not an authentication grant.

- [ ] Identify duplicated pure functions and public schema contracts before sharing code.
- [ ] Pin upstream revisions and review licenses/notices; a UI inspiration is not permission to copy assets.
- [ ] Test native site, UltraDeck alone and coexistence configurations with the same long feed.
- [ ] Measure actionable density, p95 input latency and memory growth while preserving every retained post and control.
- [ ] Keep site-version failures explicit; do not route around access restrictions.
