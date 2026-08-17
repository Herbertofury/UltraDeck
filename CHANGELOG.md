# Changelog

## 8.2.0 - 2026-08-16
- Ported Nocturne-style jank removal principles into UltraDeck without card culling.
- Coalesced scroll processing to one frame.
- Time-sliced geometry verification around pending input.
- Rejected irrelevant Patreon/X href mutations before post identity work.
- Added cached exact source/identity resolution for Patreon and X.
- Hardened Patreon `role=article` and permalink-only feed cards.
- Hardened X identity to prefer the outer tweet timestamp and ignore quoted-status links.
- Preserved WIP-009 O(1) retained-order lookup and bounded virtualizer modeling.
