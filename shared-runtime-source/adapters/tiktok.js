(() => {
  'use strict';

  const VIDEO_PATH_RE = /\/@([^/?#]+)\/video\/(\d+)(?:[/?#]|$)/i;
  const POST_SHELL = [
    '[data-e2e="recommend-list-item-container"]',
    '[data-e2e="recommend-list-item"]',
    '[data-e2e*="feed-item" i]',
    'article',
    'div[class*="-DivItemContainer"]',
    'div[class*="video-card"]',
  ].join(',');
  const postIdCache = new WeakMap();
  const sourceById = new Map();
  const playbackState = new WeakMap();
  const observedVideos = new WeakSet();
  const visibleVideos = new Set();
  let playbackInstalled = false;
  let playbackObserver = null;
  let playbackIntersection = null;
  let watchdogTimer = 0;

  const playback = {
    videosObserved: 0,
    nativeVideosObserved: 0,
    mirrorVideosObserved: 0,
    mirrorRecoveries: 0,
    errors: 0,
    networkErrors: 0,
    decodeErrors: 0,
    unsupportedErrors: 0,
    stalls: 0,
    waits: 0,
    watchdogRecoveries: 0,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    recoveryFailures: 0,
    nativeRetryClicks: 0,
    mediaReloads: 0,
    playKicks: 0,
  };

  const normalizeHref = (href) => {
    try { return new URL(String(href || ''), document.baseURI || location.href).href; }
    catch { return String(href || ''); }
  };
  const videoLinksIn = (root) => {
    try { return root?.querySelectorAll?.('a[href*="/video/"]') || []; }
    catch { return []; }
  };
  const remember = (post, id, link = null, href = '') => {
    if (!(post instanceof Element) || !id) return String(id || '');
    const value = String(id);
    postIdCache.set(post, { id:value, link, href:String(href || '') });
    sourceById.set(value, post);
    return value;
  };
  const postId = (post) => {
    if (!(post instanceof Element)) return '';
    for (const attr of ['data-video-id','data-item-id','data-post-id','data-id']) {
      const value = String(post.getAttribute(attr) || '').trim();
      if (/^\d{8,}$/.test(value) || /^\d+$/.test(value)) return remember(post, value);
    }
    const cached = postIdCache.get(post);
    if (cached) {
      if (!cached.link || (cached.link instanceof Element && post.contains(cached.link) && String(cached.link.getAttribute('href') || '') === cached.href)) return cached.id;
      postIdCache.delete(post);
    }
    for (const link of videoLinksIn(post)) {
      const href = String(link.getAttribute('href') || '');
      const match = normalizeHref(href).match(VIDEO_PATH_RE);
      if (match) return remember(post, match[2], link, href);
    }
    const player = post.querySelector?.('div.xgplayer-container[id],div[id^="xgwrapper-"]');
    const playerId = String(player?.id || '');
    const playerMatch = playerId.match(/(?:xgwrapper-[^-]+-)(\d{8,})$/i);
    if (playerMatch) return remember(post, playerMatch[1]);
    return '';
  };
  const invalidatePostId = (post) => { if (post instanceof Element) postIdCache.delete(post); };

  const candidateFromLink = (link) => {
    if (!(link instanceof Element)) return null;
    const direct = link.closest(POST_SHELL);
    if (direct && direct.querySelector('video,div.xgplayer-container,div[id^="xgwrapper-"]')) return direct;
    let node = link.parentElement;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches('main,[role="main"]') && depth > 1) break;
      const media = node.querySelector('video,div.xgplayer-container,div[id^="xgwrapper-"]');
      const actions = node.querySelector('section[class*="SectionActionBarContainer"],div[class*="action-bar"],button[data-e2e*="like" i],button[aria-label*="like" i]');
      if (media && actions) return node;
    }
    return direct || link.parentElement;
  };
  const candidates = (root = document) => {
    const out = [], seen = new Set();
    const add = (el) => {
      if (!(el instanceof HTMLElement) || seen.has(el)) return;
      const id = postId(el);
      if (!id) return;
      seen.add(el); out.push(el);
    };
    try {
      if (root instanceof Element && root.matches?.(POST_SHELL)) add(root);
      root.querySelectorAll?.(POST_SHELL).forEach((el) => {
        if (el.querySelector('a[href*="/video/"],video,div.xgplayer-container,div[id^="xgwrapper-"]')) add(el);
      });
      videoLinksIn(root).forEach((link) => add(candidateFromLink(link)));
    } catch {}
    return out;
  };

  const mirrorVideo = (video) => Boolean(video?.closest?.('#tu-ultrawide-deck-shell'));
  const stateFor = (video) => {
    let state = playbackState.get(video);
    if (!state) {
      state = { attempts:0, windowStart:0, lastAttempt:0, lastProgressAt:performance.now(), lastTime:Number(video.currentTime || 0), waitingAt:0, recoveryTimer:0 };
      playbackState.set(video, state);
    }
    return state;
  };
  const rememberProgress = (video) => {
    if (!(video instanceof HTMLVideoElement)) return;
    const state = stateFor(video);
    const now = performance.now();
    const current = Number(video.currentTime || 0);
    if (Math.abs(current - state.lastTime) > 0.04) {
      state.lastTime = current;
      state.lastProgressAt = now;
      state.attempts = 0;
      state.windowStart = 0;
    }
  };
  const retryButtonNear = (video) => {
    let post = video?.closest?.(POST_SHELL) || candidateFromLink(video?.closest?.('a[href*="/video/"]'));
    if (mirrorVideo(video)) {
      const mirrorPost = video?.closest?.('[data-tu-mirror-post]');
      const id = String(mirrorPost?.dataset?.tuMirrorPost || '');
      const native = sourceById.get(id);
      if (native instanceof HTMLElement && native.isConnected) post = native;
    }
    const roots = [post, video?.parentElement, document].filter(Boolean);
    const retryRe = /(?:try\s*again|retry|reload|play\s*again)/i;
    for (const root of roots) {
      let buttons = [];
      try { buttons = [...root.querySelectorAll('button,[role="button"],[data-e2e*="retry" i]')]; } catch {}
      for (const button of buttons) {
        const label = `${button.getAttribute?.('aria-label') || ''} ${button.getAttribute?.('title') || ''} ${button.textContent || ''}`.trim();
        if (retryRe.test(label) || /retry/i.test(String(button.getAttribute?.('data-e2e') || ''))) return button;
      }
      const text = String(root.textContent || '').replace(/\s+/g, ' ').toLowerCase();
      if (!/(ran into an error|can't play|cannot play|couldn't play|video unavailable|video is unavailable)/i.test(text)) continue;
      const generic = buttons.find((button) => !button.disabled);
      if (generic) return generic;
    }
    return null;
  };
  const expectedToPlay = (video) => {
    if (!(video instanceof HTMLVideoElement) || document.hidden) return false;
    if (!video.paused && !video.ended) return true;
    return visibleVideos.has(video) && (video.autoplay || video.getAttribute('data-e2e')?.toLowerCase().includes('video'));
  };
  const mediaErrorCode = (video) => Number(video?.error?.code || 0);
  const scheduleRecovery = (video, reason, delay = 0) => {
    if (!(video instanceof HTMLVideoElement)) return;
    const state = stateFor(video);
    if (state.recoveryTimer) clearTimeout(state.recoveryTimer);
    state.recoveryTimer = window.setTimeout(() => {
      state.recoveryTimer = 0;
      void recoverVideo(video, reason);
    }, Math.max(0, delay));
  };
  const recoverVideo = async (video, reason) => {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    const state = stateFor(video);
    const now = performance.now();
    if (now - state.lastAttempt < 900) return false;
    if (!state.windowStart || now - state.windowStart > 30000) { state.windowStart = now; state.attempts = 0; }
    if (state.attempts >= 4) { playback.recoveryFailures += 1; return false; }
    state.attempts += 1;
    state.lastAttempt = now;
    playback.recoveryAttempts += 1;
    if (mirrorVideo(video)) playback.mirrorRecoveries += 1;

    const retry = retryButtonNear(video);
    if (retry instanceof HTMLElement && !retry.hasAttribute('disabled')) {
      try {
        retry.click();
        playback.nativeRetryClicks += 1;
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (video.isConnected && !video.ended) {
          try { await video.play(); playback.playKicks += 1; } catch {}
        }
        playback.recoverySuccesses += 1;
        return true;
      } catch {}
    }

    const code = mediaErrorCode(video);
    const previousTime = Number(video.currentTime || 0);
    const shouldPlay = expectedToPlay(video) || reason === 'error' || reason === 'watchdog';
    try {
      video.preload = 'auto';
      if (code === 2 || code === 3 || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || video.readyState === 0) {
        try { video.load(); playback.mediaReloads += 1; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 120));
      } else if (video.readyState < 3 && Number.isFinite(previousTime) && previousTime > 0) {
        try { video.currentTime = Math.max(0, previousTime - 0.035); } catch {}
      }
      if (shouldPlay) {
        try { await video.play(); playback.playKicks += 1; } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      rememberProgress(video);
      if (!mediaErrorCode(video) && (video.readyState >= 2 || !video.paused)) {
        playback.recoverySuccesses += 1;
        return true;
      }
    } catch {}

    if (state.attempts < 4 && video.isConnected) scheduleRecovery(video, `${reason}-retry`, Math.min(2400, 500 * state.attempts));
    else playback.recoveryFailures += 1;
    return false;
  };
  const observeVideo = (video) => {
    if (!(video instanceof HTMLVideoElement) || observedVideos.has(video)) return;
    observedVideos.add(video);
    playback.videosObserved += 1;
    if (mirrorVideo(video)) playback.mirrorVideosObserved += 1;
    else playback.nativeVideosObserved += 1;
    stateFor(video);
    try { playbackIntersection?.observe(video); } catch {}
  };
  const scanVideos = (root = document) => {
    if (root instanceof HTMLVideoElement) observeVideo(root);
    try { root.querySelectorAll?.('video').forEach(observeVideo); } catch {}
  };
  const installPlaybackRecovery = () => {
    if (playbackInstalled) return;
    playbackInstalled = true;
    if ('IntersectionObserver' in globalThis) {
      playbackIntersection = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (!(video instanceof HTMLVideoElement)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45) visibleVideos.add(video);
          else visibleVideos.delete(video);
        }
      }, { threshold:[0,0.45,0.8] });
    }
    document.addEventListener('error', (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      observeVideo(video); playback.errors += 1;
      const code = mediaErrorCode(video);
      if (code === 2) playback.networkErrors += 1;
      else if (code === 3) playback.decodeErrors += 1;
      else if (code === 4) playback.unsupportedErrors += 1;
      scheduleRecovery(video, 'error', 0);
    }, true);
    document.addEventListener('stalled', (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      observeVideo(video); playback.stalls += 1;
      if (expectedToPlay(video)) scheduleRecovery(video, 'stalled', 900);
    }, true);
    document.addEventListener('waiting', (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      observeVideo(video); playback.waits += 1; stateFor(video).waitingAt = performance.now();
      if (expectedToPlay(video)) scheduleRecovery(video, 'waiting', 1800);
    }, true);
    document.addEventListener('playing', (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      observeVideo(video); rememberProgress(video); stateFor(video).waitingAt = 0;
    }, true);
    document.addEventListener('timeupdate', (event) => {
      const video = event.target;
      if (video instanceof HTMLVideoElement) rememberProgress(video);
    }, true);
    playbackObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) if (node instanceof Element) scanVideos(node);
      }
    });
    if (document.documentElement) playbackObserver.observe(document.documentElement, { childList:true, subtree:true });
    scanVideos(document);
    watchdogTimer = window.setInterval(() => {
      const now = performance.now();
      for (const video of [...visibleVideos]) {
        if (!(video instanceof HTMLVideoElement) || !video.isConnected) { visibleVideos.delete(video); continue; }
        if (!expectedToPlay(video) || video.seeking || video.ended) continue;
        const state = stateFor(video);
        rememberProgress(video);
        if (now - state.lastProgressAt > 4500 && video.readyState < 4) {
          playback.watchdogRecoveries += 1;
          scheduleRecovery(video, 'watchdog', 0);
        }
      }
    }, 2500);
  };

  globalThis.__UltraDeckSiteAdapter = Object.freeze({
    id:'tiktok', label:'TikTok', version:1, matches:['https://www.tiktok.com/*','https://tiktok.com/*'],
    postSelector:POST_SHELL,
    uncapturedSelector:'[data-e2e="recommend-list-item-container"]:not([data-tu-native-source="1"]),[data-e2e="recommend-list-item"]:not([data-tu-native-source="1"]),article:not([data-tu-native-source="1"])',
    timelineSelector:'main,[role="main"],[data-e2e="recommend-list"],[data-e2e="recommend-list-container"]',
    timelineEvidenceSelector:'a[href*="/video/"],video,div.xgplayer-container',
    contentSelector:'video,a[href*="/video/"]',
    excludedAncestorSelector:'aside,[role="complementary"],[data-e2e*="comment" i]',
    identityAttributes:['data-video-id','data-item-id','data-post-id','data-id','href','id'], routeAttributes:[], topBaseline:60,
    postCandidates:candidates, postId, invalidatePostId,
    isPost(post) { return Boolean(post instanceof HTMLElement && postId(post) && post.querySelector('video,a[href*="/video/"],div.xgplayer-container,div[id^="xgwrapper-"]')); },
    closestPost(node) {
      if (!(node instanceof Element)) return null;
      const direct = node.closest(POST_SHELL);
      if (direct && postId(direct)) return direct;
      const link = node.closest('a[href*="/video/"]') || node.querySelector?.('a[href*="/video/"]');
      return candidateFromLink(link);
    },
    locateSourceById(id, root=document) {
      id=String(id||''); if(!id) return null;
      const cached=sourceById.get(id);
      if(cached instanceof HTMLElement && cached.isConnected && postId(cached)===id && (root===document || root.contains?.(cached))) return cached;
      sourceById.delete(id);
      for(const post of candidates(root)) if(postId(post)===id) return post;
      return null;
    },
    timelineKey(timeline) { return `${timeline?.getAttribute?.('data-e2e')||''} ${timeline?.getAttribute?.('aria-label')||''} ${location.pathname}`; },
    timelineScoreBonus(key) { let bonus=0; if(/recommend|for.you|following|friends|feed|main/i.test(key||'')) bonus+=120; if(/comment|sidebar|search.suggest/i.test(key||'')) bonus-=500; return bonus; },
    routeKey() { return `${location.pathname}${location.search}`; },
    capabilities:Object.freeze({rails:true,tumblrCssMap:false,tumblrNpfMedia:false,staticTumblrMediaPreconnects:false,nativeVirtualizer:true,retainedVideoPlayback:true,tiktokPlaybackRecovery:true}),
    railHints:Object.freeze({leftPaths:['/','/foryou','/following','/friends','/live','/explore','/messages'],rightPhrases:[],rightSelectors:['aside[role="complementary"]']}),
    topChromeLinkSelector:'header a[href="/"],header a[href*="/foryou"],header nav a,[data-e2e="top-login-button"]',
    utilityLinkSelector:'a[href*="/search"],button[aria-label*="search" i],input[type="search"]',
    installRuntimeHooks() { installPlaybackRecovery(); },
    runtimeDiagnostics() {
      return {
        tiktokPlaybackRecoveryInstalled:playbackInstalled,
        tiktokPlaybackVideosObserved:playback.videosObserved,
        tiktokPlaybackNativeVideosObserved:playback.nativeVideosObserved,
        tiktokPlaybackMirrorVideosObserved:playback.mirrorVideosObserved,
        tiktokPlaybackMirrorRecoveries:playback.mirrorRecoveries,
        tiktokPlaybackErrors:playback.errors,
        tiktokPlaybackNetworkErrors:playback.networkErrors,
        tiktokPlaybackDecodeErrors:playback.decodeErrors,
        tiktokPlaybackUnsupportedErrors:playback.unsupportedErrors,
        tiktokPlaybackStalls:playback.stalls,
        tiktokPlaybackWaits:playback.waits,
        tiktokPlaybackWatchdogRecoveries:playback.watchdogRecoveries,
        tiktokPlaybackRecoveryAttempts:playback.recoveryAttempts,
        tiktokPlaybackRecoverySuccesses:playback.recoverySuccesses,
        tiktokPlaybackRecoveryFailures:playback.recoveryFailures,
        tiktokPlaybackNativeRetryClicks:playback.nativeRetryClicks,
        tiktokPlaybackMediaReloads:playback.mediaReloads,
        tiktokPlaybackPlayKicks:playback.playKicks,
        tiktokPlaybackVisibleTrackedVideos:visibleVideos.size,
      };
    },
    actionAliases:Object.freeze({
      like:'[data-e2e="like-icon"],[data-e2e="browse-like-icon"],[data-e2e*="like" i],[aria-label*="like" i]',
      menu:'[data-e2e*="more" i],[data-e2e*="menu" i],[aria-label*="more" i],[aria-label*="options" i]',
      repost:'[data-e2e*="repost" i],[aria-label*="repost" i],[aria-label*="re-post" i]',
      reblog:'[data-e2e*="repost" i],[aria-label*="repost" i],[aria-label*="re-post" i]',
      comment:'[data-e2e="comment-icon"],[data-e2e="browse-comment-icon"],[data-e2e*="comment" i],[aria-label*="comment" i]',
      reply:'[data-e2e="comment-icon"],[data-e2e="browse-comment-icon"],[data-e2e*="comment" i],[aria-label*="comment" i],[aria-label*="reply" i]',
      share:'[data-e2e="share-icon"],[data-e2e="browse-share-icon"],[data-e2e*="share" i],[aria-label*="share" i]',
      bookmark:'[data-e2e*="favorite" i],[data-e2e*="collect" i],[aria-label*="favorite" i],[aria-label*="save" i]',
      poll:'[role="radio"],[data-e2e*="poll" i]',
      expand:'[aria-expanded],summary,[data-e2e*="more" i],[data-e2e*="expand" i]',
      permalink:'a[href*="/video/"]',
      input:'textarea,input:not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable="true"]'
    }),
  });
})();
