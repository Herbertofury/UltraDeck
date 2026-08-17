(() => {
  'use strict';
  const POST_PATH_RE = /\/posts\/(?:[^/?#]*?-)?(\d+)(?:[/?#]|$)/i;
  const POST_SHELL = 'article,[role="article"],[data-testid*="post" i],[data-tag*="post" i]';
  const linksIn = (root) => root instanceof Element || root instanceof Document ? root.querySelectorAll('a[href*="/posts/"]') : [];
  const postIdCache = new WeakMap();
  const sourceById = new Map();
  const remember = (post, id, link = null, href = '') => {
    if (!(post instanceof Element) || !id) return id || '';
    postIdCache.set(post, { id:String(id), link, href:String(href || '') });
    sourceById.set(String(id), post);
    return String(id);
  };
  const postId = (post) => {
    if (!(post instanceof Element)) return '';
    for (const attr of ['data-post-id','data-post_id','data-id']) {
      const value = String(post.getAttribute(attr) || '').trim();
      if (/^\d+$/.test(value)) return remember(post, value);
    }
    const cached = postIdCache.get(post);
    if (cached) {
      if (!cached.link || (cached.link instanceof Element && post.contains(cached.link) && String(cached.link.getAttribute('href') || '') === cached.href)) return cached.id;
      postIdCache.delete(post);
    }
    for (const link of linksIn(post)) {
      if (link.closest(POST_SHELL) !== post && post.matches(POST_SHELL)) continue;
      const href = String(link.getAttribute('href') || '');
      const match = href.match(POST_PATH_RE);
      if (match) return remember(post, match[1], link, href);
    }
    return '';
  };
  const invalidatePostId = (post) => { if (post instanceof Element) postIdCache.delete(post); };
  const candidateFromLink = (link) => {
    if (!(link instanceof Element)) return null;
    const shell = link.closest(POST_SHELL);
    if (shell && !shell.matches('main,section,[role="main"]')) return shell;
    let node = link.parentElement;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches('main,section,[role="main"]')) break;
      const controls = node.querySelectorAll('button,[role="button"],a[href],input,textarea').length;
      const media = node.querySelectorAll('img,picture,video,audio,iframe').length;
      if (controls >= 2 || media >= 1) {
        const rect = node.getBoundingClientRect();
        if (rect.width >= 260 && rect.height >= 90) return node;
      }
    }
    return link.parentElement;
  };
  const candidates = (root = document) => {
    const out = [], seen = new Set();
    const add = (el) => {
      if (!(el instanceof HTMLElement) || seen.has(el)) return;
      const id = postId(el);
      if (!id) return;
      seen.add(el); out.push(el);
    };
    if (root instanceof Element && root.matches?.(POST_SHELL)) add(root);
    try {
      root.querySelectorAll?.(POST_SHELL).forEach(add);
      linksIn(root).forEach((link) => add(candidateFromLink(link)));
    } catch {}
    return out;
  };
  globalThis.__UltraDeckSiteAdapter = Object.freeze({
    id: 'patreon', label: 'Patreon', version: 2,
    matches: ['https://www.patreon.com/*'],
    postSelector: POST_SHELL,
    uncapturedSelector: 'article:not([data-tu-native-source="1"]),[role="article"]:not([data-tu-native-source="1"]),[data-testid*="post" i]:not([data-tu-native-source="1"]),[data-tag*="post" i]:not([data-tu-native-source="1"])',
    timelineSelector: 'main,[role="main"]', timelineEvidenceSelector: 'a[href*="/posts/"]', contentSelector: POST_SHELL,
    excludedAncestorSelector: 'aside,[role="complementary"]', identityAttributes: ['data-post-id','data-post_id','data-id','href'], routeAttributes: [], topBaseline: 64,
    postCandidates: candidates, postId, invalidatePostId,
    isPost(post) { return Boolean(post instanceof HTMLElement && postId(post)); },
    closestPost(node) {
      if (!(node instanceof Element)) return null;
      const direct = node.closest(POST_SHELL);
      if (direct && postId(direct)) return direct;
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
