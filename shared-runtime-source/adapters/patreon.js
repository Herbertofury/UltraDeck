(() => {
  'use strict';
  const POST_PATH_RE = /\/posts\/(?:[^/?#]*?-)?(\d+)(?:[/?#]|$)/i;
  const PRIMARY_SHELL = 'article,[role="article"]';
  const FALLBACK_SHELL = '[data-post-id],[data-post_id],[data-testid="post-card"],[data-testid="post"],[data-tag="post-card"],[data-tag="post"]';
  const POST_SHELL = `${PRIMARY_SHELL},${FALLBACK_SHELL}`;
  const linksIn = (root) => root instanceof Element || root instanceof Document ? root.querySelectorAll('a[href*="/posts/"]') : [];
  const postIdCache = new WeakMap();
  const sourceById = new Map();
  const remember = (post, id, link = null, href = '') => {
    if (!(post instanceof Element) || !id) return id || '';
    postIdCache.set(post, { id:String(id), link, href:String(href || '') });
    sourceById.set(String(id), post);
    return String(id);
  };
  const idFromLink = (link) => {
    if (!(link instanceof Element)) return '';
    const match = String(link.getAttribute('href') || '').match(POST_PATH_RE);
    return match ? match[1] : '';
  };
  const postId = (post) => {
    if (!(post instanceof Element)) return '';
    for (const attr of ['data-post-id','data-post_id']) {
      const value = String(post.getAttribute(attr) || '').trim();
      if (/^\d+$/.test(value)) return remember(post, value);
    }
    const cached = postIdCache.get(post);
    if (cached && (!cached.link || (cached.link instanceof Element && post.contains(cached.link) && String(cached.link.getAttribute('href') || '') === cached.href))) return cached.id;
    postIdCache.delete(post);
    for (const link of linksIn(post)) {
      const id = idFromLink(link);
      if (id) return remember(post, id, link, link.getAttribute('href') || '');
    }
    return '';
  };
  const invalidatePostId = (post) => { if (post instanceof Element) postIdCache.delete(post); };
  const candidateFromLink = (link) => {
    if (!(link instanceof Element) || !idFromLink(link)) return null;
    const direct = link.closest(PRIMARY_SHELL);
    if (direct instanceof HTMLElement && !direct.matches('main,section,[role="main"]')) return direct;
    const fallback = link.closest(FALLBACK_SHELL);
    if (fallback instanceof HTMLElement && !fallback.matches('main,section,[role="main"]')) return fallback;
    let node = link.parentElement;
    let best = null;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches('main,[role="main"]')) break;
      const rect = node.getBoundingClientRect();
      if (rect.width < 260 || rect.height < 90 || rect.height > 2400) continue;
      const controls = node.querySelectorAll('button,[role="button"],a[href],input,textarea').length;
      const media = node.querySelectorAll('img,picture,video,audio,iframe').length;
      const headings = node.querySelectorAll('h1,h2,h3,[role="heading"]').length;
      if (controls >= 2 || media >= 1 || headings >= 1) best = node;
      if (best && node.querySelectorAll('a[href*="/posts/"]').length === 1 && controls >= 3) break;
    }
    return best;
  };
  const candidates = (root = document) => {
    const byId = new Map();
    const add = (el) => {
      if (!(el instanceof HTMLElement)) return;
      const id = postId(el);
      if (!id) return;
      const current = byId.get(id);
      if (!current || current.contains(el)) byId.set(id, el);
    };
    try {
      linksIn(root).forEach((link) => add(candidateFromLink(link)));
      root.querySelectorAll?.(POST_SHELL).forEach((el) => {
        if (el.querySelector?.('a[href*="/posts/"]') || el.hasAttribute('data-post-id') || el.hasAttribute('data-post_id')) add(el);
      });
    } catch {}
    return [...byId.values()];
  };
  globalThis.__UltraDeckSiteAdapter = Object.freeze({
    id: 'patreon', label: 'Patreon', version: 3,
    matches: ['https://www.patreon.com/*'],
    postSelector: POST_SHELL,
    uncapturedSelector: `${POST_SHELL.split(',').map((s) => `${s}:not([data-tu-native-source="1"])`).join(',')}`,
    timelineSelector: 'main,[role="main"]', timelineEvidenceSelector: 'a[href*="/posts/"]', contentSelector: POST_SHELL,
    excludedAncestorSelector: 'aside,[role="complementary"]', identityAttributes: ['data-post-id','data-post_id','href'], routeAttributes: [],
    topBaseline: 64, maxDeckTop: 156, bootEvidenceSelector: 'main,[role="main"],a[href*="/posts/"]',
    postCandidates: candidates, postId, invalidatePostId,
    isPost(post) { return Boolean(post instanceof HTMLElement && postId(post)); },
    closestPost(node) {
      if (!(node instanceof Element)) return null;
      const direct = node.closest(POST_SHELL);
      if (direct instanceof HTMLElement && postId(direct)) return direct;
      const link = node.closest('a[href*="/posts/"]') || node.querySelector?.('a[href*="/posts/"]');
      return candidateFromLink(link);
    },
    locateSourceById(id, root = document) {
      id = String(id || ''); if (!id) return null;
      const cached = sourceById.get(id);
      if (cached instanceof HTMLElement && cached.isConnected && postId(cached) === id && (root === document || root.contains?.(cached))) return cached;
      sourceById.delete(id);
      for (const post of candidates(root)) if (postId(post) === id) return post;
      return null;
    },
    timelineKey(timeline) { return `${timeline?.getAttribute?.('aria-label') || ''} ${timeline?.getAttribute?.('data-testid') || ''} ${location.pathname}`; },
    timelineScoreBonus(key) { let bonus=0; if (/home|posts|membership|creator|main/i.test(key||'')) bonus+=90; if (/sidebar|navigation/i.test(key||'')) bonus-=400; return bonus; },
    routeKey() { return `${location.pathname}${location.search}`; },
    capabilities: Object.freeze({ rails:true,tumblrCssMap:false,tumblrNpfMedia:false,staticTumblrMediaPreconnects:false,nativeVirtualizer:true }),
    railHints: Object.freeze({ leftPaths:['/home','/memberships','/explore','/messages','/settings'], rightPhrases:[], rightSelectors:['aside[role="complementary"]'] }),
    topChromeLinkSelector: 'a[href="/home"],a[href*="/memberships"],header nav a', utilityLinkSelector: 'a[href*="/search"],button[aria-label*="filter" i]',
    actionAliases: Object.freeze({
      like:'[aria-label*="like" i],[data-testid*="like" i],button[title*="like" i]', menu:'[aria-label*="more" i],[aria-label*="options" i],[data-testid*="more" i]',
      comment:'[aria-label*="comment" i],[data-testid*="comment" i]', reply:'[aria-label*="comment" i],[aria-label*="reply" i],[data-testid*="comment" i]',
      share:'[aria-label*="share" i],[data-testid*="share" i]', repost:'[aria-label*="repost" i],[aria-label*="reshare" i],[data-testid*="repost" i],[data-testid*="reshare" i]',
      reblog:'[aria-label*="repost" i],[aria-label*="reshare" i],[data-testid*="repost" i],[data-testid*="reshare" i]',
      expand:'[aria-expanded],summary,button[aria-label*="more" i]', permalink:'a[href*="/posts/"]', input:'textarea,input:not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable="true"]'
    }),
  });
})();
