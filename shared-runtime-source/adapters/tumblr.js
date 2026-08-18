(() => {
  'use strict';
  const normalizePath = (href) => {
    try { return new URL(href, document.baseURI || location.href).pathname.replace(/\/$/, '') || '/'; }
    catch { return ''; }
  };
  const leftPaths = ['/dashboard','/explore','/communities','/activity','/messaging','/inbox','/account','/settings','/tumblr-mart'];
  globalThis.__UltraDeckSiteAdapter = Object.freeze({
    id: 'tumblr',
    label: 'Tumblr',
    version: 1,
    matches: ['https://www.tumblr.com/*'],
    postSelector: '[tabindex="-1"][data-id]',
    uncapturedSelector: '[tabindex="-1"][data-id]:not([data-tu-native-source="1"])',
    timelineSelector: '[data-timeline],[data-timeline-id]',
    timelineEvidenceSelector: '[tabindex="-1"][data-id] article',
    contentSelector: 'article',
    excludedAncestorSelector: 'aside,[role="complementary"]',
    identityAttributes: ['data-id'],
    routeAttributes: ['data-timeline','data-timeline-id'],
    topBaseline: 76,
    maxDeckTop: 154,
    bootEvidenceSelector: '[data-timeline],[data-timeline-id],main',
    postId(post) {
      return String(post?.dataset?.id || post?.getAttribute?.('data-id') || '').trim();
    },
    isPost(post) {
      return Boolean(post instanceof HTMLElement && post.querySelector('article'));
    },
    locateSourceById(id, root = document) {
      if (!id) return null;
      try {
        const escaped = globalThis.CSS?.escape ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&');
        const hit = root.querySelector(`[tabindex="-1"][data-id="${escaped}"]`);
        return hit instanceof HTMLElement ? hit : null;
      } catch { return null; }
    },
    timelineKey(timeline) {
      return `${timeline?.dataset?.timeline || ''} ${timeline?.dataset?.timelineId || ''}`;
    },
    timelineScoreBonus(key) {
      let bonus = 0;
      if (/dashboard|following|for.you|stuff.for.you|hubs|search|tag/i.test(key || '')) bonus += 120;
      if (/radar|sidebar|recommended/i.test(key || '')) bonus -= 500;
      return bonus;
    },
    routeKey() { return location.pathname; },
    subscribeNavigation(callback) { try { window.tumblr?.on?.('navigation', callback); } catch {} },
    capabilities: Object.freeze({
      rails: true,
      tumblrCssMap: true,
      tumblrNpfMedia: true,
      staticTumblrMediaPreconnects: true,
      nativeVirtualizer: true,
    }),
    railHints: Object.freeze({
      leftPaths,
      rightPhrases: ['check out these blogs','radar','explore all of tumblr','show more blogs','recommended blogs'],
      rightCssMapKeys: [['desktopContainer','summary'],['sidebarItem','sidebarContent'],['about','inSidebar'],['mrecContainer']],
    }),
    topChromeLinkSelector: 'a[href*="/dashboard/following"],a[href*="/dashboard/stuff_for_you"],a[href*="/dashboard/hubs"],a[href*="/dashboard/missed_posts"],a[href*="/explore"]',
    utilityLinkSelector: 'a[href*="/new/"],a[href*="/tagged/"],a[href*="/search/"]',
    actionAliases: Object.freeze({
      like: '[data-testid="like"],[aria-label*="like" i]',
      menu: '[data-testid="caret"],[aria-label*="more" i],[aria-label*="options" i]',
      reblog: '[data-testid="reblog"],[aria-label*="reblog" i]',
      reply: '[data-testid="reply"],[aria-label*="reply" i]',
      poll: '[data-testid="poll-answer"],[role="radio"]',
      expand: '[data-testid="expand"],summary,[aria-expanded]',
      permalink: '[data-testid="permalink"],a[href*="/post/"]',
      input: '[data-testid="comment-input"],textarea,input:not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable="true"]',
    }),
  });
})();
