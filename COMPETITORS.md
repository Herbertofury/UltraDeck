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
