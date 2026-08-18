(() => {
  'use strict';
  const STATUS_RE = /\/status\/(\d+)/i;
  const POST_SHELL = 'article[data-testid="tweet"],article[role="article"]';
  const statusCache = new WeakMap();
  const sourceById = new Map();
  const ownedStatusLinks = (post) => [...post.querySelectorAll('a[href*="/status/"]')].filter((link) => link.closest('article') === post);
  const statusId = (post) => {
    if (!(post instanceof Element)) return '';
    const direct = String(post.getAttribute('data-post-id') || post.getAttribute('data-id') || '').trim();
    if (/^\d+$/.test(direct)) { statusCache.set(post,{id:direct,link:null,href:''}); sourceById.set(direct,post); return direct; }
    const cached = statusCache.get(post);
    if (cached && cached.link instanceof Element && post.contains(cached.link) && String(cached.link.getAttribute('href') || '') === cached.href) return cached.id;
    const links = ownedStatusLinks(post);
    const timestamp = links.find((link) => link.querySelector('time') || link.matches(':has(time)'));
    const ordered = timestamp ? [timestamp, ...links.filter((link) => link !== timestamp)] : links;
    for (const link of ordered) {
      const href = String(link.getAttribute('href') || '');
      const match = href.match(STATUS_RE);
      if (match) { const id=match[1]; statusCache.set(post,{id,link,href}); sourceById.set(id,post); return id; }
    }
    statusCache.delete(post); return '';
  };
  const invalidatePostId = (post) => { if (post instanceof Element) statusCache.delete(post); };
  globalThis.__UltraDeckSiteAdapter = Object.freeze({
    id:'x', label:'X', version:2, matches:['https://x.com/*','https://twitter.com/*'],
    postSelector:POST_SHELL,
    uncapturedSelector:'article[data-testid="tweet"]:not([data-tu-native-source="1"]),article[role="article"]:not([data-tu-native-source="1"])',
    timelineSelector:'[aria-label*="Timeline" i],[data-testid="primaryColumn"] section,main section',
    timelineEvidenceSelector:'article[data-testid="tweet"] a[href*="/status/"],article[role="article"] a[href*="/status/"]', contentSelector:'article',
    excludedAncestorSelector:'aside,[role="complementary"]', identityAttributes:['data-post-id','data-id','href'], routeAttributes:[], topBaseline:56, maxDeckTop:132, bootEvidenceSelector:'#react-root,[data-testid="primaryColumn"],main[role="main"]',
    postId:statusId, invalidatePostId,
    isPost(post) { return Boolean(post instanceof HTMLElement && post.matches('article') && statusId(post)); },
    locateSourceById(id, root=document) {
      id=String(id||''); if(!id) return null;
      const cached=sourceById.get(id);
      if(cached instanceof HTMLElement && cached.isConnected && statusId(cached)===id && (root===document || root.contains?.(cached))) return cached;
      sourceById.delete(id);
      let links=[];
      try { const escaped=globalThis.CSS?.escape?CSS.escape(id):id.replace(/["\\]/g,'\\$&'); links=[...root.querySelectorAll(`a[href*="/status/${escaped}"]`)]; } catch {}
      for(const link of links){ const article=link.closest(POST_SHELL); if(article instanceof HTMLElement && statusId(article)===id) return article; }
      return null;
    },
    timelineKey(timeline){return `${timeline?.getAttribute?.('aria-label')||''} ${timeline?.getAttribute?.('data-testid')||''}`;},
    timelineScoreBonus(key){let bonus=0;if(/timeline|primarycolumn|home/i.test(key||''))bonus+=120;if(/trending|who to follow|sidebar/i.test(key||''))bonus-=500;return bonus;},
    routeKey(){return `${location.pathname}${location.search}`;},
    capabilities:Object.freeze({rails:true,tumblrCssMap:false,tumblrNpfMedia:false,staticTumblrMediaPreconnects:false,nativeVirtualizer:true}),
    railHints:Object.freeze({leftPaths:['/home','/explore','/notifications','/messages','/i/bookmarks','/compose/post'],rightPhrases:['what’s happening','what is happening','who to follow','trending'],rightSelectors:['[data-testid="sidebarColumn"]','aside[role="complementary"]']}),
    topChromeLinkSelector:'a[href="/home"],a[href="/explore"],[role="tablist"]', utilityLinkSelector:'a[href="/compose/post"],a[href*="/search"]',
    actionAliases:Object.freeze({
      like:'[data-testid="like"],[data-testid="unlike"],[aria-label*="like" i]', menu:'[data-testid="caret"],[aria-label*="more" i]',
      repost:'[data-testid="retweet"],[data-testid="unretweet"],[aria-label*="repost" i],[aria-label*="retweet" i]', reblog:'[data-testid="retweet"],[data-testid="unretweet"],[aria-label*="repost" i],[aria-label*="retweet" i]',
      reply:'[data-testid="reply"],[aria-label*="reply" i]', bookmark:'[data-testid="bookmark"],[data-testid="removeBookmark"],[aria-label*="bookmark" i]',
      share:'[data-testid="share"],[aria-label*="share" i]', expand:'[data-testid="tweet-text-show-more-link"],[aria-expanded],summary', permalink:'a[href*="/status/"]',
      input:'textarea,input:not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable="true"]'
    }),
  });
})();
