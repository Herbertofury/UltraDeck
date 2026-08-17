# UltraDeck v8.0.0 site-adapter research and capability matrix

Research refreshed 2026-08-09 against current official documentation. The architectural question is whether ordinary UltraDeck browsing should depend on a developer API or use the already-authenticated native page/session as the baseline authority.

| Site | Current feed/product evidence | Developer API evidence | UltraDeck baseline mode | Adapter implications |
|---|---|---|---|---|
| Tumblr | Existing UltraDeck/XKit-compatible timeline semantics and `data-id` post identity remain the established integration target. | Tumblr-specific page APIs are optional accelerators where exposed. | Native authenticated DOM/session plus optional Tumblr page accelerators. | Direct `data-id` identity, Tumblr timeline evidence, NPF/CSS-map media acceleration when available. |
| Patreon | Patreon documents a desktop Home screen with latest creator updates and creator Posts pages with filtering/search; Patreon also now has Quips and evolving network/discovery surfaces. | API v2 exposes campaign-scoped post endpoints; `GET /api/oauth2/v2/campaigns/{campaign_id}/posts` and individual post retrieval require `campaigns.posts`. | Native authenticated DOM/session. No API credential is required for normal member browsing. | Semantic article/post discovery, permalink-derived ID fallback with self-validating WeakMap cache, native like/comment/share controls, broad route support. |
| X / Twitter | X documents For You and Following timelines. | The reverse-chronological home timeline requires authenticated user context (OAuth 1.0a User Context or OAuth 2.0 Authorization Code with PKCE). X API access is pay-per-use/credit-based. | Native authenticated DOM/session. No X developer entitlement is required for normal browsing. | Tweet/article discovery, `/status/<id>` identity, native like/repost/reply/bookmark/menu controls, support for both `x.com` and `twitter.com`. |

## Primary sources

- Patreon Help, creator posts/Quips: https://support.patreon.com/hc/en-gb/articles/360039998431-How-to-find-a-creator-s-posts-and-Quips
- Patreon API v2 reference: https://docs.patreon.com/
- Patreon updated creator page: https://support.patreon.com/hc/en-us/articles/36972391815693-Your-updated-creator-page
- X timeline help: https://help.x.com/en/using-x/x-timeline
- X timeline API overview: https://docs.x.com/x-api/posts/timelines/introduction
- X home timeline API: https://docs.x.com/x-api/users/get-timeline
- X API pricing: https://docs.x.com/x-api/getting-started/pricing
- XKit Rewritten source/reference for Tumblr structural integration: https://github.com/AprilSylph/XKit-Rewritten

## Decision

The extension framework uses site adapters over the native authenticated page/session as the normal feed and interaction authority. Developer APIs remain optional future enrichers where they add capabilities that the page cannot provide. This avoids turning ordinary feed layout into a credentialed API product, preserves the exact controls/state the user is already looking at, and lets off-screen interaction recovery operate through the site's own native virtualizer.

## Guardrails for future adapters

1. A new site gets its own adapter `.js`; it does not fork the core runtime.
2. Post identity must be stable and self-validating when cached.
3. Feed discovery must not include sidebars/recommendation rails as posts.
4. Native actions must route to the exact source control and remain recoverable when the native source is off-screen/unmounted.
5. No card culling, `content-visibility`, retained-post deactivation, or quantity cap may be introduced for performance.
6. API integration is optional unless it is both officially supported and clearly superior for the required user flow; capture-only or private/internal APIs are not represented as normal API support.
