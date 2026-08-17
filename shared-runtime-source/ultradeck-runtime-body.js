    'use strict';

    const ID = 'tu-ultrawide-deck';
    const VERSION = '8.4.0';
    const SITE = globalThis.__UltraDeckSiteAdapter || Object.freeze({
        id: 'tumblr',
        label: 'Tumblr',
        version: 0,
        postSelector: '[tabindex="-1"][data-id]',
        timelineSelector: '[data-timeline],[data-timeline-id]',
        timelineEvidenceSelector: '[tabindex="-1"][data-id] article',
        contentSelector: 'article',
        excludedAncestorSelector: 'aside,[role="complementary"]',
        identityAttributes: ['data-id','data-timeline','data-timeline-id'],
        postId(post) { return String(post?.dataset?.id || post?.getAttribute?.('data-id') || '').trim(); },
        isPost(post) { return Boolean(post instanceof HTMLElement && post.querySelector('article')); },
        locateSourceById(id, root = document) {
            if (!id) return null;
            try { return root.querySelector(`[tabindex="-1"][data-id="${CSS.escape(String(id))}"]`); } catch { return null; }
        },
        timelineKey(timeline) { return `${timeline?.dataset?.timeline || ''} ${timeline?.dataset?.timelineId || ''}`; },
        timelineScoreBonus(key) { return /dashboard|following|for you|search|tagged|explore/i.test(key || '') ? 120 : 0; },
        routeKey() { return `${location.pathname}${location.search}`; },
        capabilities: Object.freeze({ rails: true, tumblrCssMap: true, tumblrNpfMedia: true, staticTumblrMediaPreconnects: true, nativeVirtualizer: true }),
        railHints: Object.freeze({ leftPaths: ['/dashboard','/explore','/communities','/activity','/messaging','/inbox','/account','/settings','/tumblr-mart'], rightPhrases: ['check out these blogs','radar','sponsored'], rightSelectors: ['aside[role="complementary"]'] }),
        topChromeLinkSelector: 'a[href="/dashboard"],a[href^="/dashboard/"],header nav a',
        utilityLinkSelector: 'a[href*="/search"],button[aria-label*="filter" i]',
        actionAliases: Object.freeze({}),
    });
    const SITE_ID = String(SITE.id || 'unknown');
    const SITE_LABEL = String(SITE.label || SITE_ID || 'Site');
    const STORAGE_KEY = `${ID}:v2`;
    const LEGACY_STORAGE_KEY = `${ID}:v1`;
    const POST_SELECTOR = String(SITE.postSelector || '[data-id]');
    const TIMELINE_SELECTOR = String(SITE.timelineSelector || 'main,[role="main"]');
    const POST_CONTENT_SELECTOR = String(SITE.contentSelector || 'article');
    const EXCLUDED_SOURCE_SELECTOR = String(SITE.excludedAncestorSelector || 'aside,[role="complementary"]');
    const IDENTITY_ATTRIBUTES = Object.freeze([...new Set((SITE.identityAttributes || ['data-id']).map(String).filter(Boolean))]);
    const ROUTE_ATTRIBUTES = Object.freeze([...new Set((SITE.routeAttributes || []).map(String).filter(Boolean))]);
    const OBSERVED_ATTRIBUTES = Object.freeze([...new Set([
        'src','srcset','sizes','poster','data-src','data-srcset','data-original','data-lazy-src','data-lazy-srcset',
        'aria-pressed','aria-checked','aria-expanded','aria-selected','data-state','open','disabled','class','hidden', ...IDENTITY_ATTRIBUTES, ...ROUTE_ATTRIBUTES,
    ])]);
    const MAX_COLUMNS = 20;

    const defaults = Object.freeze({
        columns: 'auto',
        minCardWidth: 320,
        minCardHeight: 0,
        maxColumns: 20,
        gap: 16,
        layoutMode: 'masonry',
        mediaOnly: false,
        gutter: 16,
        rowUnit: 6,
        cardRadius: 12,
        leftOpen: true,
        rightOpen: true,
        focus: false,
        compact: false,
        softRails: false,
        proactiveBuffer: true,
        turboMedia: true,
        liveInteraction: true,
        adaptivePerformance: true,
    });

    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const connected = (el) => el instanceof HTMLElement && el.isConnected;
    const lowText = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const rectVisible = (el) => {
        if (!connected(el)) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
    };
    const normalizePath = (href) => {
        try { return new URL(href, document.baseURI || location.href).pathname.replace(/\/$/, '') || '/'; }
        catch { return ''; }
    };


    const CAPABILITIES = SITE?.capabilities || Object.freeze({});
    const siteCapability = (name) => Boolean(CAPABILITIES[name]);
    const SITE_ROUTE_KEY = typeof SITE.routeKey === 'function' ? SITE.routeKey : () => location.pathname;
    const SITE_POST_ID = typeof SITE.postId === 'function'
        ? SITE.postId
        : (post) => String(post?.dataset?.id || post?.getAttribute?.('data-id') || '').trim();
    const SITE_POST_CANDIDATES = typeof SITE.postCandidates === 'function' ? SITE.postCandidates : null;
    const SITE_CLOSEST_POST = typeof SITE.closestPost === 'function' ? SITE.closestPost : null;
    const SITE_IS_POST = typeof SITE.isPost === 'function' ? SITE.isPost : null;
    const SITE_TIMELINE_CANDIDATES = typeof SITE.timelineCandidates === 'function' ? SITE.timelineCandidates : null;
    const SITE_TIMELINE_KEY = typeof SITE.timelineKey === 'function' ? SITE.timelineKey : () => '';
    const SITE_TIMELINE_SCORE_BONUS = typeof SITE.timelineScoreBonus === 'function' ? SITE.timelineScoreBonus : () => 0;
    const SITE_LOCATE_SOURCE = typeof SITE.locateSourceById === 'function' ? SITE.locateSourceById : null;
    const SITE_INVALIDATE_POST_ID = typeof SITE.invalidatePostId === 'function' ? SITE.invalidatePostId : null;
    const SITE_ACTION_ALIASES = SITE?.actionAliases && typeof SITE.actionAliases === 'object' ? SITE.actionAliases : Object.freeze({});

    const siteRouteKey = () => {
        try { return String(SITE_ROUTE_KEY() || location.pathname); } catch { return location.pathname; }
    };
    // Site adapters are trusted frozen modules shipped with UltraDeck. Compile their hot callbacks once
    // rather than rediscovering/validating/normalizing the same hook on every post or mutation.
    const postId = SITE_POST_ID;
    function postCandidates(root = document) {
        try {
            if (SITE_POST_CANDIDATES) {
                const value = SITE_POST_CANDIDATES(root);
                return Array.isArray(value) ? value : [...(value || [])];
            }
            return [...root.querySelectorAll(POST_SELECTOR)];
        } catch { return []; }
    }
    // Compile the ancestor resolver once. Element.closest() already checks the element itself,
    // so generic adapters need one native selector walk, not matches()+closest()+exception scaffolding
    // on every media/mutation/interaction event. Specialized adapters keep their exact resolver.
    const closestSourcePost = SITE_CLOSEST_POST
        ? (node) => node instanceof Element ? SITE_CLOSEST_POST(node) : null
        : (node) => node instanceof Element ? node.closest(POST_SELECTOR) : null;
    function hasPostContent(post) {
        if (!(post instanceof HTMLElement)) return false;
        try {
            if (SITE_IS_POST) return Boolean(SITE_IS_POST(post));
            return Boolean(post.matches?.(POST_CONTENT_SELECTOR) || post.querySelector?.(POST_CONTENT_SELECTOR));
        } catch { return false; }
    }
    function siteTimelineCandidates() {
        try {
            if (SITE_TIMELINE_CANDIDATES) {
                const value = SITE_TIMELINE_CANDIDATES(document);
                return Array.isArray(value) ? value : [...(value || [])];
            }
            return [...document.querySelectorAll(TIMELINE_SELECTOR)];
        } catch { return []; }
    }
    function timelineKey(timeline) {
        try { return String(SITE_TIMELINE_KEY(timeline) || ''); } catch { return ''; }
    }
    function timelineScoreBonus(key) {
        try { return Number(SITE_TIMELINE_SCORE_BONUS(key) || 0); } catch { return 0; }
    }
    function siteLocateSourceById(id, root = document) {
        if (!SITE_LOCATE_SOURCE) return null;
        try {
            const hit = SITE_LOCATE_SOURCE(String(id || ''), root);
            return hit instanceof HTMLElement ? hit : null;
        } catch { return null; }
    }
    const siteActionAliases = () => SITE_ACTION_ALIASES;
    function hasUncapturedPost(scope) {
        const selector = String(SITE.uncapturedSelector || '').trim();
        if (selector) { try { return Boolean(scope.querySelector(selector)); } catch {} }
        return postCandidates(scope).some((post) => validSourcePost(post) && post.dataset.tuNativeSource !== '1');
    }
    function nodeContainsPostCandidate(node) {
        if (!(node instanceof Element)) return false;
        try {
            // This is intentionally self/descendant-only. Do not use closestSourcePost() here:
            // ordinary child churn inside an existing retained post is not a newly inserted post shell.
            if (!SITE_POST_CANDIDATES) return Boolean(node.matches?.(POST_SELECTOR) || node.querySelector?.(POST_SELECTOR));
            if (node.matches?.(POST_SELECTOR) && validSourcePost(node)) return true;
            return postCandidates(node).some(validSourcePost);
        } catch { return false; }
    }
    const IDENTITY_ATTRIBUTE_SET = new Set(IDENTITY_ATTRIBUTES);
    const ROUTE_ATTRIBUTE_SET = new Set(ROUTE_ATTRIBUTES);
    const isIdentityAttribute = (name) => IDENTITY_ATTRIBUTE_SET.has(String(name || ''));
    const isRouteAttribute = (name) => ROUTE_ATTRIBUTE_SET.has(String(name || ''));

    function loadSettings() {
        let parsed = {};
        try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
        // Carry forward only user-facing v1 preferences. Do not inherit any v1 engine state.
        if (!Object.keys(parsed).length) {
            try {
                const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
                for (const key of ['columns','minCardWidth','maxColumns','gap','gutter','rowUnit','cardRadius','leftOpen','rightOpen','compact','softSidebars']) {
                    if (legacy[key] != null) parsed[key === 'softSidebars' ? 'softRails' : key] = legacy[key];
                }
            } catch {}
        }
        const out = { ...defaults, ...parsed };
        out.minCardWidth = clamp(Number(out.minCardWidth) || defaults.minCardWidth, 160, 720);
        out.minCardHeight = clamp(Number(out.minCardHeight) || 0, 0, 1600);
        out.maxColumns = clamp(Number(out.maxColumns) || defaults.maxColumns, 1, MAX_COLUMNS);
        out.gap = clamp(Number(out.gap) || defaults.gap, 4, 48);
        out.layoutMode = out.layoutMode === 'rows' ? 'rows' : 'masonry';
        out.mediaOnly = Boolean(out.mediaOnly);
        out.gutter = clamp(Number(out.gutter) || defaults.gutter, 0, 72);
        out.rowUnit = clamp(Number(out.rowUnit) || defaults.rowUnit, 3, 16);
        out.cardRadius = clamp(Number(out.cardRadius) || defaults.cardRadius, 0, 32);
        if (out.columns !== 'auto') out.columns = clamp(Number(out.columns) || 1, 1, out.maxColumns);
        return out;
    }

    let settings = loadSettings();
    let previousRailState = { leftOpen: settings.leftOpen, rightOpen: settings.rightOpen };

    const makeSideState = () => ({
        frame: null,
        fragments: [],
        width: 0,
        top: 8,
        saved: new WeakMap(),
    });

    const initialTopChrome = clamp(Number(SITE.topBaseline) || 76, 32, 190);
    const state = {
        cssMap: null,
        cssMapReady: false,
        responsiveStyle: null,
        timeline: null,
        shell: null,
        grid: null,
        hud: null,
        shadow: null,
        toast: null,
        cache: new Map(),
        order: [],
        sequence: 0,
        actualColumns: 1,
        renderedColumns: 0,
        top: clamp(Math.round(initialTopChrome + 8), 72, 260),
        topChromeBottom: initialTopChrome,
        topUtilityBottom: 0,
        topAnchorSource: 'baseline',
        topAnchorRoute: location.pathname,
        topAnchorReflows: 0,
        left: makeSideState(),
        right: makeSideState(),
        resizeObserver: null,
        mutationObserver: null,
        route: location.href,
        scanTimer: 0,
        layoutRaf: 0,
        railTimer: 0,
        topTimer: 0,
        routeTimer: 0,
        railDiscoveryRoute: '',
        railDiscoveryComplete: false,
        railDiscoveryRuns: 0,
        topDiscoveryRuns: 0,
        prefetchAbort: 0,
        prefetching: false,
        pumpFailures: 0,
        nativeScrollRoots: [],
        nativeScrollRootsRoute: '',
        nativeScrollRootScans: 0,
        lastNewPostAt: 0,
        lastCaptureAt: 0,
        mediaSyncRaf: 0,
        mediaDirty: new Set(),
        mediaQueueRunning: false,
        mediaSyncs: 0,
        mediaSkips: 0,
        decodeQueue: [],
        decodeActive: 0,
        decodeCompleted: 0,
        preconnected: new Set(),
        spanDirty: new Map(),
        spanRaf: 0,
        spanWrites: 0,
        columnEls: [],
        columnLoads: [],
        columnRebuilds: 0,
        columnPlacements: 0,
        layoutMode: 'masonry',
        verifyTimer: 0,
        harvestQueue: new Set(),
        harvestScheduled: false,
        postBuildQueue: [],
        postBuildSet: new Set(),
        postBuildScheduled: false,
        postBuildBatches: 0,
        incrementalHarvests: 0,
        fullScans: 0,
        bufferObserver: null,
        bufferSentinel: null,
        mediaPriorityObserver: null,
        scrollLastTop: 0,
        scrollLastAt: 0,
        scrollVelocity: 0,
        scrollRaf: 0,
        deckScrollTop: 0,
        deckScrollHeight: 0,
        deckClientHeight: 0,
        deckRemaining: Infinity,
        longTaskObserver: null,
        longTaskCount: 0,
        longTaskMs: 0,
        lastLongTaskAt: 0,
        liveRecord: null,
        actionStage: null,
        actionStageTimer: 0,
        actionStageRestores: 0,
        nativeActions: 0,
        nativeInputSyncs: 0,
        interactionRestores: 0,
        interactionFailures: 0,
        interactionMountRequests: 0,
        interactionMountSuccesses: 0,
        interactionMountMs: 0,
        interactionMountMaxMs: 0,
        interactionFastSourceHits: 0,
        interactionSourceWaits: 0,
        interactionControlPathHits: 0,
        interactionControlSignatureHits: 0,
        interactionCapsules: 0,
        interactionCapsuleControls: 0,
        interactionCapsulePathHits: 0,
        interactionContextCaptures: 0,
        interactionContextRestores: 0,
        interactionContextStickyPreserves: 0,
        interactionContextSessionLoads: 0,
        interactionContextSessionSaves: 0,
        interactionDraftSyncRetries: 0,
        interactionDraftSyncRetrySuccesses: 0,
        interactionContextStore: null,
        interactionContextSaveTimer: 0,
        interactionAutoRetries: 0,
        interactionAutoRetrySuccesses: 0,
        interactionHoverPrewarms: 0,
        interactionHoverTimer: 0,
        interactionHoverKey: '',
        interactionProgrammaticActions: 0,
        interactionSeekProbes: 0,
        interactionSeekWindowMoves: 0,
        interactionSeekPredictions: 0,
        interactionSeekOvershoots: 0,
        interactionAnchorCaptures: 0,
        interactionAnchorAdjustments: 0,
        interactionAnchorPixels: 0,
        virtualizerPixelsPerSequence: 0,
        virtualizerPixelsPerSequenceError: 0,
        virtualizerWindowSize: 0,
        virtualizerSeekSamples: 0,
        virtualizerModelPredictions: 0,
        lastInteractionResult: null,
        mountedSources: new Map(),
        interactionRegistryActive: false,
        sourceMountWaiters: new Map(),
        sourceMountFlights: new Map(),
        sourceWindowGeneration: 0,
        nativeInteractionReaders: 0,
        nativeInteractionReadersDrain: null,
        nativeInteractionReadersDrainResolve: null,
        nativeInteractionWriterTail: Promise.resolve(),
        nativeInteractionWriterPending: 0,
        nativeInteractionWriterActive: false,
        interactionTransactionReads: 0,
        interactionTransactionWrites: 0,
        interactionTransactionQueued: 0,
        interactionTransactionWaitMs: 0,
        interactionTransactionMaxWaitMs: 0,
        interactionTransactionMaxQueue: 0,
        interactionIntentPrewarms: 0,
        interactionIntentPrewarmHits: 0,
        sourceWindowWaiters: new Set(),
        nativeScrollLeaseUntil: 0,
        nativeScrollLeaseTimer: 0,
        deferredBufferTarget: 0,
        deferredBufferReason: '',
        activeBufferTarget: 0,
        postWaiters: new Set(),
        nativeWaiters: new Set(),
        nativeCapturedIds: new Set(),
        nativeSnapshotCaptures: 0,
        nativePumpSignals: 0,
        mediaNativePrimes: 0,
        mediaLoadHooks: 0,
        mediaRefreshToken: 0,
        mediaRefreshRuns: 0,
        mediaDirectStarts: 0,
        mediaPlaceholderRejects: 0,
        mediaQualityUpgrades: 0,
        mediaQualityMisses: 0,
        mediaQualityReady: 0,
        mediaWarmers: new Map(),
        mediaWarmStarts: 0,
        mediaWarmHits: 0,
        mediaWarmCompleted: 0,
        mediaWarmHandedOff: 0,
        earlyMediaObserver: null,
        earlyMediaSeen: new WeakMap(),
        earlyMediaHints: new WeakMap(),
        earlyMediaPrimed: 0,
        instantMediaHookInstalled: false,
        instantMediaSeen: new WeakMap(),
        instantMediaMutating: new WeakSet(),
        instantMediaPrimed: 0,
        instantMediaWarmStarts: 0,
        instantResponsivePriorities: 0,
        mediaWarmDecoded: 0,
        mediaPreloads: new Map(),
        mediaPreloadStarts: 0,
        mediaPreloadHits: 0,
        mediaPreloadCompleted: 0,
        mediaPreloadErrors: 0,
        mediaPreloadHandedOff: 0,
        mediaPreloadPeak: 0,
        mediaHeroSchedules: 0,
        mediaHeroFirstScheduleAt: 0,
        staticMediaPreconnects: 0,
        apiMediaHookInstalled: false,
        tumblrApiFetchHookInstalled: false,
        tumblrApiFetchHookAttempts: 0,
        tumblrApiFetchResponses: 0,
        tumblrApiFetchMediaResponses: 0,
        apiPayloadSeen: new WeakSet(),
        apiMediaScans: 0,
        apiMediaBlocks: 0,
        apiMediaStarts: 0,
        apiMediaHighStarts: 0,
        apiMediaHeroStarts: 0,
        apiMediaSecondaryStarts: 0,
        apiHighPostBudgetRemaining: 0,
        apiHeroWavePrimed: false,
        apiMediaUrls: new Set(),
        apiPostMediaHints: new Map(),
        apiPostDomMappings: new WeakMap(),
        apiPostHintsStored: 0,
        apiPostHintUses: 0,
        apiPostHintMapBuilds: 0,
        apiLateRescues: 0,
        apiLateRescueStarts: 0,
        cardWidth: 0,
        geometryAuditTimer: 0,
        geometryAuditGeneration: 0,
        geometryAudits: 0,
        geometryAuditYields: 0,
        geometryAuditCards: 0,
        geometryViolations: 0,
        identityMutationSkips: 0,
        overlapRepairs: 0,
        diagnostics: null,
        booted: false,
    };

    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
    }

    function cssSelector(...keys) {
        if (!state.cssMap) return '';
        const classes = keys.flatMap((key) => Array.isArray(state.cssMap[key]) ? state.cssMap[key] : []).filter(Boolean);
        return classes.length ? `:is(${classes.map((name) => `.${CSS.escape(name)}`).join(',')})` : '';
    }

    async function warmCssMap() {
        if (state.cssMapReady) return;
        if (!siteCapability('tumblrCssMap')) { state.cssMapReady = true; refreshResponsiveCloneStyle(); return; }
        for (let i = 0; i < 160; i += 1) {
            const fn = window.tumblr?.getCssMap;
            if (typeof fn === 'function') {
                try {
                    const map = await Promise.race([
                        Promise.resolve(fn.call(window.tumblr)),
                        new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
                    ]);
                    if (map && typeof map === 'object') state.cssMap = map;
                } catch {}
                break;
            }
            await sleep(25);
        }
        state.cssMapReady = true;
        refreshResponsiveCloneStyle();
    }

    function refreshResponsiveCloneStyle() {
        if (!document.documentElement) return;
        let style = state.responsiveStyle;
        if (!style?.isConnected) {
            style = document.createElement('style');
            style.id = `${ID}-responsive-style`;
            (document.head || document.documentElement).appendChild(style);
            state.responsiveStyle = style;
        }
        const grid = `#${ID}-grid`;
        const scoped = (...keys) => {
            const selector = cssSelector(...keys);
            return selector ? `${grid} [data-tu-mirror-post] ${selector}` : '';
        };
        const cell = cssSelector('cell');
        const reblog = scoped('reblog');
        const row = scoped('row');
        const rows = scoped('rows');
        const imageBlock = scoped('imageBlockButton', 'imageBlockLink', 'imageBlockGifAttribution');
        const videoBlock = scoped('videoBlock');
        const audioBlock = scoped('audioBlock');
        const linkBlock = scoped('link');
        const pollBlock = scoped('pollBlock');
        const withImage = scoped('withImage');
        const adBlocks = scoped('adTimelineObject', 'instreamAd', 'nativeIponWebAd', 'takeoverBanner', 'signpostCta');
        const structural = [
            `${grid} [data-tu-mirror-post] article`,
            `${grid} [data-tu-mirror-post] article > header`,
            cell ? `${grid} ${cell}` : '',
            reblog, row, rows, imageBlock, videoBlock, audioBlock, linkBlock, pollBlock, adBlocks,
        ].filter(Boolean).join(',\n');
        const richBlocks = [videoBlock, audioBlock, linkBlock, pollBlock].filter(Boolean).join(',\n');
        style.textContent = `
            ${structural || `${grid} [data-tu-mirror-post] article`} {
                min-width:0 !important;
                max-width:100% !important;
                box-sizing:border-box !important;
            }
            ${imageBlock || `${grid} [data-tu-mirror-post] figure`} { min-width:0 !important; max-width:100% !important; }
            ${richBlocks || `${grid} [data-tu-mirror-post] iframe`} { min-width:0 !important; max-width:100% !important; }
            ${videoBlock ? `${videoBlock} iframe` : `${grid} [data-tu-mirror-post] iframe`} { max-width:100% !important; width:100% !important; }
            ${withImage || `${grid} [data-tu-mirror-post] [data-is-resizable="true"]`} { max-width:100% !important; }
            ${grid} [data-tu-mirror-post] [data-is-resizable="true"][style*="width: 540px"],
            ${grid} [data-tu-mirror-post] [data-is-resizable="true"][style*="width:540px"] {
                width:100% !important; min-width:0 !important; max-width:100% !important;
            }
            ${grid} [data-tu-mirror-post] :where(div,section,article,header,footer,figure,picture,blockquote) { min-width:0 !important; max-width:100% !important; box-sizing:border-box !important; }
            ${grid} [data-tu-mirror-post] :where(p,li,a) { overflow-wrap:anywhere !important; }
            ${grid} [data-tu-mirror-post] :where(button,a,[role="button"],[role="link"]) { min-width:0 !important; max-width:100% !important; }
            ${grid} [data-tu-mirror-post] :where(div,footer,header,section):has(> button),
            ${grid} [data-tu-mirror-post] :where(div,footer,header,section):has(> [role="button"]) { flex-wrap:wrap !important; min-width:0 !important; max-width:100% !important; }
            ${grid} [data-tu-mirror-post] :where(label):has(input,textarea,select) { display:flex !important; flex-wrap:wrap !important; min-width:0 !important; max-width:100% !important; }
            ${grid} [data-tu-mirror-post] :where(input,textarea,select) { min-width:0 !important; max-width:100% !important; flex:1 1 90px; }
        `;
    }

    function injectStyle() {
        if (document.getElementById(`${ID}-style`)) return;
        const style = document.createElement('style');
        style.id = `${ID}-style`;
        style.textContent = `
            #${ID}-shell { --tu-gap:16px; --tu-row:6px; --tu-radius:12px; --tu-min-card-height:0px; }
            body { overflow-x: clip !important; scrollbar-width:none !important; }
            body::-webkit-scrollbar { width:0 !important; height:0 !important; }
            [data-tu-native-source="1"] { visibility:hidden !important; pointer-events:none !important; }

            #${ID}-shell {
                position:fixed !important;
                z-index:30 !important;
                top:var(--tu-shell-top,126px) !important;
                bottom:0 !important;
                left:var(--tu-shell-left,16px) !important;
                right:var(--tu-shell-right,16px) !important;
                overflow-y:auto !important;
                overflow-x:hidden !important;
                overscroll-behavior:contain !important;
                scrollbar-gutter:stable !important;
                scrollbar-width:thin !important;
                padding:0 2px 96px !important;
                box-sizing:border-box !important;
                pointer-events:auto !important;
                background:rgb(var(--navy,0 0 0)/.01) !important;
            }
            #${ID}-grid {
                display:flex !important;
                flex-direction:row !important;
                gap:var(--tu-gap) !important;
                align-items:flex-start !important;
                width:100% !important;
                min-width:0 !important;
                box-sizing:border-box !important;
                padding:0 !important;
                margin:0 !important;
                overflow-anchor:none !important;
            }
            #${ID}-grid > .tu-column {
                flex:1 1 0 !important;
                min-width:0 !important;
                width:0 !important;
                display:flex !important;
                flex-direction:column !important;
                gap:var(--tu-gap) !important;
                align-items:stretch !important;
                contain:inline-size style !important;
            }
            #${ID}-grid > .tu-column > .tu-item,
            #${ID}-grid > .tu-item {
                flex:0 0 auto !important;
                min-width:0 !important;
                width:100% !important;
                max-width:100% !important;
                min-height:var(--tu-min-card-height,0px) !important;
                box-sizing:border-box !important;
                overflow:visible !important;
                contain:inline-size style !important;
                position:relative !important;
            }
            #${ID}-shell[data-tu-layout="rows"] #${ID}-grid {
                display:grid !important;
                grid-template-columns:repeat(var(--tu-cols,1),minmax(0,1fr)) !important;
                gap:var(--tu-gap) !important;
                align-items:start !important;
            }
            #${ID}-shell[data-tu-layout="rows"] #${ID}-grid > .tu-item { width:100% !important; min-width:0 !important; }
            #${ID}-grid [data-tu-mirror-post] {
                position:relative !important;
                inset:auto !important;
                top:auto !important;
                right:auto !important;
                bottom:auto !important;
                left:auto !important;
                transform:none !important;
                translate:none !important;
                float:none !important;
                width:100% !important;
                max-width:none !important;
                min-width:0 !important;
                height:auto !important;
                min-height:var(--tu-min-card-height,0px) !important;
                margin:0 !important;
                box-sizing:border-box !important;
                border-radius:var(--tu-radius) !important;
            }
            #${ID}-grid [data-tu-mirror-post] article,
            #${ID}-grid [data-tu-mirror-post] [data-testid*="post"] {
                width:100% !important;
                max-width:100% !important;
                min-width:0 !important;
                min-height:var(--tu-min-card-height,0px) !important;
                box-sizing:border-box !important;
            }
            #${ID}-grid img,#${ID}-grid video,#${ID}-grid iframe,#${ID}-grid canvas { max-width:100% !important; }
            /* Tumblr frequently bakes its native single-column width into nested inline styles.
               Cap those widths without flattening legitimate small controls/icons. */
            #${ID}-grid [data-tu-mirror-post] [style*="width"] { max-width:100% !important; }
            #${ID}-grid [data-tu-mirror-post] [style*="min-width"] { min-width:0 !important; }
            #${ID}-grid [data-tu-mirror-post] :where(article,article > *,[data-testid*="post"]) { min-width:0 !important; max-width:100% !important; box-sizing:border-box !important; }
            #${ID}-grid [data-tu-mirror-post] :where(picture,figure,pre,blockquote) { max-width:100% !important; min-width:0 !important; }
            #${ID}-grid [data-tu-mirror-post] :where(pre,code) { overflow-wrap:anywhere !important; white-space:pre-wrap !important; }
            #${ID}-grid [data-tu-mirror-post] :where(button,a,[role="button"],[role="link"]) { min-width:0 !important; max-width:100% !important; }
            #${ID}-grid [data-tu-mirror-post] [data-tu-action-kind] { visibility:visible !important; opacity:1 !important; pointer-events:auto !important; }
            #${ID}-grid [data-tu-mirror-post] [data-tu-action-bar="1"] { visibility:visible !important; opacity:1 !important; pointer-events:auto !important; }
            #${ID}-grid [data-tu-mirror-post] :where(div,footer,header,section):has(> button),
            #${ID}-grid [data-tu-mirror-post] :where(div,footer,header,section):has(> [role="button"]) { flex-wrap:wrap !important; min-width:0 !important; max-width:100% !important; }
            #${ID}-grid [data-tu-mirror-post] :where(label):has(input,textarea,select) { display:flex !important; flex-wrap:wrap !important; min-width:0 !important; max-width:100% !important; }
            #${ID}-grid [data-tu-mirror-post] :where(input,textarea,select) { min-width:0 !important; max-width:100% !important; flex:1 1 90px; }
            #${ID}-grid [data-tu-mirror-post] :where(dialog,[aria-modal="true"],[popover]) { display:none !important; }
            #${ID}-grid [data-tu-mirror-post] :where(*) { box-sizing:border-box; }
            #${ID}-grid [data-tu-mirror-post] :where(img,video,canvas,svg,picture,figure) { max-inline-size:100% !important; }
            #${ID}-grid [data-tu-mirror-post] [data-tu-fixed-reset="1"] { position:relative !important; inset:auto !important; translate:none !important; transform:none !important; z-index:auto !important; }
            #${ID}-sentinel { width:100% !important; height:2px !important; margin:0 !important; padding:0 !important; pointer-events:none !important; opacity:0 !important; }
            #${ID}-shell[data-tu-compact="1"] #${ID}-grid p { line-height:1.34 !important; }
            #${ID}-shell[data-tu-media-only="1"] #${ID}-grid .tu-item:not([data-tu-show-text="1"]) [data-tu-text-only="1"] { display:none !important; }
            .tu-text-peek {
                display:none !important;
                position:absolute !important;
                top:8px !important;
                right:8px !important;
                z-index:8 !important;
                min-width:0 !important;
                width:auto !important;
                height:26px !important;
                padding:0 9px !important;
                border:1px solid rgba(255,255,255,.16) !important;
                border-radius:999px !important;
                background:rgba(7,10,16,.86) !important;
                color:#dff7ff !important;
                font:800 10px/1 ui-sans-serif,system-ui,sans-serif !important;
                letter-spacing:.03em !important;
                backdrop-filter:blur(10px) !important;
                box-shadow:0 6px 20px rgba(0,0,0,.35) !important;
                cursor:pointer !important;
            }
            #${ID}-shell[data-tu-media-only="1"] #${ID}-grid .tu-item[data-tu-has-hidden-text="1"] > .tu-text-peek { display:block !important; }
            .tu-buffer-card {
                min-height:84px !important;
                display:flex !important;
                align-items:center !important;
                justify-content:center !important;
                gap:10px !important;
                color:rgba(255,255,255,.72) !important;
                font:700 12px/1.4 ui-sans-serif,system-ui,sans-serif !important;
            }
            .tu-buffer-card::before { content:""; width:8px; height:8px; border-radius:50%; background:#37d6ff; box-shadow:0 0 16px #37d6ff; animation:tuPulse 1s ease-in-out infinite alternate; }
            @keyframes tuPulse { to { opacity:.28; transform:scale(.72); } }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    const RAIL_HINTS = SITE?.railHints && typeof SITE.railHints === 'object' ? SITE.railHints : {};
    const LEFT_PATHS = new Set(Array.isArray(RAIL_HINTS.leftPaths) ? RAIL_HINTS.leftPaths : []);
    // Each adapter supplies its small navigation vocabulary; exhaustive anchor discovery remains a
    // fallback only for unusual href shapes, never the normal hot path.
    const LEFT_ANCHOR_HINT_SELECTOR = LEFT_PATHS.size
        ? [...LEFT_PATHS].map((path) => `a[href*="${String(path).replace(/"/g, '\"')}"]`).join(',')
        : 'a[href]';
    const RIGHT_PHRASES = Object.freeze(Array.isArray(RAIL_HINTS.rightPhrases) ? RAIL_HINTS.rightPhrases.map((v) => String(v).toLowerCase()).filter(Boolean) : []);
    const RIGHT_SELECTORS = Object.freeze(Array.isArray(RAIL_HINTS.rightSelectors) ? RAIL_HINTS.rightSelectors.map(String).filter(Boolean) : []);
    const RIGHT_CSS_MAP_KEYS = Object.freeze(Array.isArray(RAIL_HINTS.rightCssMapKeys) ? RAIL_HINTS.rightCssMapKeys : []);

    function topLevel(elements) {
        const unique = [...new Set(elements.filter(connected))];
        return unique.filter((el) => !unique.some((other) => other !== el && other.contains(el)));
    }

    function exactSeeds(values) {
        const wanted = values.map((v) => v.toLowerCase());
        const matchInto = (root, found) => {
            for (const el of root.querySelectorAll('h1,h2,h3,a,span,div')) {
                if (!(el instanceof HTMLElement) || el.children.length > 8) continue;
                const t = lowText(el);
                if (wanted.some((w) => t === w || t.startsWith(`${w} `))) found.push(el);
                if (found.length > 40) break;
            }
            return found;
        };
        // Search semantic/sidebar roots before considering a document-wide fallback. X commonly uses
        // data-testid="sidebarColumn" without an aside element, so include adapter selectors here too.
        // This keeps thousands of post descendants out of phrase matching on normal feeds.
        const roots = new Set();
        try { document.querySelectorAll('aside,[role="complementary"]').forEach((el) => roots.add(el)); } catch {}
        for (const selector of RIGHT_SELECTORS) {
            try { document.querySelectorAll(selector).forEach((el) => roots.add(el)); } catch {}
        }
        const scoped = [];
        for (const root of roots) {
            if (!(root instanceof Element) || state.shell?.contains(root)) continue;
            matchInto(root, scoped);
            if (scoped.length > 40) break;
        }
        if (scoped.length) return scoped;
        return matchInto(document, []);
    }

    function leftRailAnchors() {
        if (!siteCapability('rails') || !LEFT_PATHS.size) return [];
        const found = new Set();
        const accept = (a) => {
            if (!(a instanceof HTMLAnchorElement) || state.shell?.contains(a) || state.hud?.contains(a)) return;
            if (LEFT_PATHS.has(normalizePath(a.getAttribute('href') || ''))) found.add(a);
        };
        // Normal site navigation is semantic. Scan its small anchor sets first instead of evaluating a
        // long href-substring selector against the full retained feed DOM.
        try {
            for (const root of document.querySelectorAll('header,nav,[role="navigation"],aside')) {
                if (!(root instanceof Element) || state.shell?.contains(root) || state.hud?.contains(root)) continue;
                root.querySelectorAll('a[href]').forEach(accept);
            }
        } catch {}
        if (found.size) return [...found];
        // Compatibility fallback for non-semantic/custom navigation layouts.
        try { document.querySelectorAll(LEFT_ANCHOR_HINT_SELECTOR).forEach(accept); } catch {}
        if (found.size) return [...found];
        try { document.querySelectorAll('a[href]').forEach(accept); } catch {}
        return [...found];
    }

    function findLeftRail() {
        // Navigation discovery must work while the rail is already display:none. Site SPAs can replace
        // those trees while hidden, so visibility/geometry cannot be a prerequisite for rediscovery.
        if (!siteCapability('rails') || !LEFT_PATHS.size) return { frame:null, fragments:[] };
        const anchors = leftRailAnchors();
        const frames = new Map();
        for (const anchor of anchors) {
            let node = anchor.closest('nav,[role="navigation"],aside');
            if (!node) {
                node = anchor;
                for (let d = 0; node?.parentElement && d < 10; d += 1) {
                    const p = node.parentElement;
                    const r = p.getBoundingClientRect();
                    const geometryFits = r.width >= 150 && r.width <= 460 && r.height >= 220;
                    const semanticFits = p.querySelectorAll?.('a[href]').length >= 3;
                    if (geometryFits || semanticFits) { node = p; break; }
                    node = p;
                }
            }
            if (connected(node)) frames.set(node, (frames.get(node) || 0) + 1);
        }
        const ranked = [...frames.entries()].sort((a,b) => b[1] - a[1]);
        // Do not force layout here. applyRail() already needs the frame rectangle and validates the
        // measured side geometry before styling, so a second synchronous read only duplicates work.
        const frame = ranked.find(([,count]) => count >= 3)?.[0] || ranked[0]?.[0] || null;
        const fragments = frame ? [frame] : topLevel(anchors.map((a) => a.closest('nav,[role="navigation"]') || a));
        return { frame, fragments: topLevel(fragments) };
    }

    function findRightRail() {
        if (!siteCapability('rails')) return { frame:null, fragments:[] };
        const phrases = RIGHT_PHRASES;
        const seeds = phrases.length ? exactSeeds(phrases) : [];
        const semantic = [];
        for (const selector of RIGHT_SELECTORS) {
            try { document.querySelectorAll(selector).forEach((el) => { if (!state.shell?.contains(el)) semantic.push(el); }); } catch {}
        }
        if (siteCapability('tumblrCssMap')) {
            for (const keys of RIGHT_CSS_MAP_KEYS) {
                const selector = cssSelector(...(Array.isArray(keys) ? keys : [keys]));
                if (!selector) continue;
                try { document.querySelectorAll(selector).forEach((el) => semantic.push(el)); } catch {}
            }
        }
        const frames = new Map();
        for (const seed of [...seeds, ...semantic]) {
            const aside = seed.closest?.('aside,[role="complementary"]') || (seed.matches?.('aside,[role="complementary"]') ? seed : null);
            if (connected(aside)) frames.set(aside, (frames.get(aside) || 0) + (seeds.includes(seed) ? 4 : 1));
        }
        for (const aside of document.querySelectorAll('aside,[role="complementary"]')) {
            if (!(aside instanceof HTMLElement) || state.shell?.contains(aside)) continue;
            const text = phrases.length ? lowText(aside) : '';
            const phraseScore = phrases.reduce((sum, phrase) => sum + (text.includes(phrase) ? 6 : 0), 0);
            const semanticScore = semantic.filter((node) => aside === node || aside.contains(node)).length;
            if (phraseScore || semanticScore) frames.set(aside, Math.max(frames.get(aside) || 0, phraseScore + semanticScore));
        }
        const ranked = [...frames.entries()].sort((a,b) => b[1] - a[1]);
        // Geometry belongs to applyRail(), which validates the chosen side from the same rectangle
        // snapshot used for positioning. Discovery stays structural and never forces layout itself.
        const frame = ranked[0]?.[0] || null;
        const fragments = frame ? [frame] : topLevel([...seeds, ...semantic].map((seed) => seed.closest?.('aside,[role="complementary"]') || seed));
        return { frame, fragments: topLevel(fragments) };
    }

    function saveStyle(bucket, element, prop) {
        let props = bucket.get(element);
        if (!props) { props = new Map(); bucket.set(element, props); }
        if (!props.has(prop)) props.set(prop, [element.style.getPropertyValue(prop), element.style.getPropertyPriority(prop)]);
    }
    function setSavedStyle(bucket, element, prop, value, priority = 'important') {
        saveStyle(bucket, element, prop);
        if (element.style.getPropertyValue(prop) === String(value) && element.style.getPropertyPriority(prop) === priority) return;
        element.style.setProperty(prop, value, priority);
    }
    function restoreSavedStyle(bucket, element, prop) {
        const original = bucket.get(element)?.get(prop);
        const value = original?.[0] || '';
        const priority = original?.[1] || '';
        if (element.style.getPropertyValue(prop) === value && element.style.getPropertyPriority(prop) === priority) return;
        if (!value) element.style.removeProperty(prop);
        else element.style.setProperty(prop, value, priority);
    }

    function prepareRail(sideName) {
        const side = state[sideName];
        const open = !settings.focus && (sideName === 'left' ? settings.leftOpen : settings.rightOpen);
        const elements = topLevel(side.frame ? [side.frame] : side.fragments);
        const bucket = side.saved;
        // Restore both open rails before either side is measured. discoverRails() batches this prepare
        // phase so the browser can resolve all display/style invalidations in one layout pass.
        if (open) for (const el of elements) restoreSavedStyle(bucket, el, 'display');
        return { sideName, side, open, elements, bucket };
    }

    function measureRail(prepared) {
        const { sideName, elements } = prepared;
        if (!prepared.open || !elements.length) return null;
        const measured = [];
        for (const el of elements) {
            if (!connected(el)) continue;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 4 && rect.height > 4) measured.push([el, rect]);
        }
        if (!measured.length) return null;
        const left = Math.min(...measured.map(([,r]) => r.left));
        const right = Math.max(...measured.map(([,r]) => r.right));
        const top = Math.min(...measured.map(([,r]) => r.top));
        const naturalWidth = right - left;
        if (sideName === 'left' && (naturalWidth > 540 || left > innerWidth * .62)) return null;
        if (sideName === 'right' && (left < innerWidth * .35 || naturalWidth > 760)) return null;
        return {
            measured,
            width: clamp(naturalWidth, sideName === 'left' ? 150 : 220, sideName === 'left' ? 460 : 640),
            top: clamp(top, 8, 120),
        };
    }

    function applyPreparedRail(prepared, snapshot) {
        const { sideName, side, open, elements, bucket } = prepared;
        if (!elements.length) { side.width = 0; return; }
        if (!open) {
            for (const el of elements) setSavedStyle(bucket, el, 'display', 'none');
            return;
        }
        if (!snapshot) { side.width = 0; return; }
        side.width = snapshot.width;
        side.top = snapshot.top;
        const rectByElement = new Map(snapshot.measured);

        for (const el of elements) {
            const r = rectByElement.get(el);
            if (!r) continue;
            setSavedStyle(bucket, el, 'position', 'fixed');
            setSavedStyle(bucket, el, 'top', `${side.top}px`);
            setSavedStyle(bucket, el, 'bottom', 'auto');
            setSavedStyle(bucket, el, 'z-index', '60');
            setSavedStyle(bucket, el, 'max-height', `calc(100vh - ${side.top + 10}px)`);
            if (r.height > innerHeight - side.top - 12) setSavedStyle(bucket, el, 'overflow-y', 'auto');
            if (sideName === 'left') {
                setSavedStyle(bucket, el, 'left', `${settings.gutter}px`);
                setSavedStyle(bucket, el, 'right', 'auto');
            } else {
                setSavedStyle(bucket, el, 'right', `${settings.gutter}px`);
                setSavedStyle(bucket, el, 'left', 'auto');
            }
            if (settings.softRails) setSavedStyle(bucket, el, 'opacity', '.82'); else restoreSavedStyle(bucket, el, 'opacity');
        }

        // A transformed ancestor can become the containing block of a fixed descendant. Corrections
        // deliberately run after the write batch, outside the discovery task, so they cannot create a
        // read/write/read layout chain on startup.
        const correctToViewport = () => {
            for (const el of elements.filter(connected)) {
                if (getComputedStyle(el).display === 'none') continue;
                const style = getComputedStyle(el);
                const parts = style.translate && style.translate !== 'none' ? style.translate.split(/\s+/) : [];
                const tx = Number.parseFloat(parts[0]) || 0;
                const ty = Number.parseFloat(parts[1]) || 0;
                const r = el.getBoundingClientRect();
                const dx = sideName === 'left' ? settings.gutter - r.left : (innerWidth - settings.gutter) - r.right;
                const dy = side.top - r.top;
                if (Math.abs(dx) > .5 || Math.abs(dy) > .5) {
                    setSavedStyle(bucket, el, 'translate', `${Math.round(tx + dx)}px ${Math.round(ty + dy)}px`);
                }
            }
        };
        requestAnimationFrame(() => requestAnimationFrame(correctToViewport));
        setTimeout(correctToViewport, 80);
        setTimeout(correctToViewport, 220);
    }

    function applyRail(sideName) {
        const prepared = prepareRail(sideName);
        applyPreparedRail(prepared, measureRail(prepared));
    }

    function applyRails() {
        const prepared = [prepareRail('left'), prepareRail('right')];
        // Measure both sides before applying either side's fixed-position styles. This removes the old
        // left-write -> right-read forced-layout chain on large feeds.
        const measured = prepared.map(measureRail);
        applyPreparedRail(prepared[0], measured[0]);
        applyPreparedRail(prepared[1], measured[1]);
    }

    function discoverRails(force = false) {
        const routeKey = location.pathname;
        const leftKnown = Boolean(state.left.frame || state.left.fragments.length);
        const rightKnown = Boolean(state.right.frame || state.right.fragments.length);
        const leftAlive = Boolean(state.left.frame?.isConnected || state.left.fragments.some(connected));
        const rightAlive = Boolean(state.right.frame?.isConnected || state.right.fragments.some(connected));
        const staleKnown = (leftKnown && !leftAlive) || (rightKnown && !rightAlive);
        // Stable Tumblr rails do not need to be rediscovered on every post wave, resize, or HUD update.
        // A rail DOM mutation or route transition passes force=true, so absent/replaced rails still
        // recover immediately without repeatedly walking every anchor/aside in the document.
        if (!force && state.railDiscoveryComplete && state.railDiscoveryRoute === routeKey && !staleKnown) {
            applyRails();
            updateGeometry();
            return;
        }
        const left = findLeftRail(), right = findRightRail();
        state.railDiscoveryRuns += 1;
        if (left.frame || left.fragments.length) { state.left.frame = left.frame; state.left.fragments = left.fragments; }
        else if (staleKnown && leftKnown) { state.left.frame = null; state.left.fragments = []; state.left.width = 0; }
        if (right.frame || right.fragments.length) { state.right.frame = right.frame; state.right.fragments = right.fragments; }
        else if (staleKnown && rightKnown) { state.right.frame = null; state.right.fragments = []; state.right.width = 0; }
        state.railDiscoveryRoute = routeKey;
        state.railDiscoveryComplete = true;
        applyRails();
        updateGeometry();
    }

    function verifyRailClosed(sideName) {
        const side = state[sideName];
        const shouldOpen = !settings.focus && (sideName === 'left' ? settings.leftOpen : settings.rightOpen);
        if (shouldOpen) return;
        for (const el of topLevel(side.frame ? [side.frame] : side.fragments).filter(connected)) {
            if (getComputedStyle(el).display !== 'none') el.style.setProperty('display', 'none', 'important');
        }
        const leaked = sideName === 'left'
            ? leftRailAnchors().some((a) => rectVisible(a) && a.getBoundingClientRect().left < innerWidth * .48)
            : (RIGHT_PHRASES.length ? exactSeeds(RIGHT_PHRASES).some(rectVisible) : RIGHT_SELECTORS.some((selector) => { try { return [...document.querySelectorAll(selector)].some(rectVisible); } catch { return false; } }));
        if (leaked) {
            const next = sideName === 'left' ? findLeftRail() : findRightRail();
            if (next.frame || next.fragments.length) {
                side.frame = next.frame; side.fragments = next.fragments; applyRail(sideName);
            }
        }
    }

    const MEDIA_SELECTOR = 'img,picture,video,audio,canvas,iframe,object,embed';
    const INTERACTIVE_KEEP_SELECTOR = 'button,input,textarea,select,[role="button"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[contenteditable="true"]';
    const FAST_CLONE_IMAGES = Symbol('tuFastCloneImages');
    const FAST_CLONE_VIDEOS = Symbol('tuFastCloneVideos');

    function markTextOnlyRegions(clone) {
        const article = clone?.querySelector?.('article') || clone;
        if (!(article instanceof Element) || !article.querySelector(MEDIA_SELECTOR)) return 0;
        let marked = 0;
        const mark = (el) => {
            if (!(el instanceof HTMLElement) || el.dataset.tuTextOnly === '1') return;
            if (el.closest('header,footer')) return;
            const text = (el.textContent || '').trim();
            if (!text) return;
            if (el.querySelector(MEDIA_SELECTOR) || el.querySelector(INTERACTIVE_KEEP_SELECTOR)) return;
            el.dataset.tuTextOnly = '1';
            marked += 1;
        };
        article.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,pre').forEach(mark);
        // Tumblr/NFP text sometimes lands in lightweight div/section wrappers rather than semantic
        // paragraphs. Mark only small leaf-ish containers with direct text and no media/control
        // descendants so usernames, action bars, polls, and embedded controls stay available.
        article.querySelectorAll('div,section').forEach((el) => {
            if (el.closest('header,footer') || el.dataset.tuTextOnly === '1') return;
            if (el.querySelector(MEDIA_SELECTOR) || el.querySelector(INTERACTIVE_KEEP_SELECTOR)) return;
            const directText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 0);
            if (!directText || el.children.length > 6) return;
            mark(el);
        });
        return marked;
    }

    function syncTextPeek(record) {
        if (!record?.item || !record.clone) return;
        const count = Number(record.clone.dataset.tuTextRegionCount || 0);
        record.item.dataset.tuHasHiddenText = count > 0 ? '1' : '0';
        let button = record.item.querySelector(':scope > .tu-text-peek');
        if (!count) { button?.remove(); return; }
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'tu-text-peek';
            button.title = 'Temporarily reveal or hide this post text';
            record.item.appendChild(button);
        }
        button.textContent = record.item.dataset.tuShowText === '1' ? 'Hide text' : 'Show text';
    }

    function sanitizeClone(clone, id, indexMedia = false) {
        clone.dataset.tuMirrorPost = id;
        clone.removeAttribute('tabindex');
        clone.removeAttribute('data-tu-native-source');
        clone.removeAttribute('aria-hidden');

        // Let Chromium's selector engine identify only descendants that can require sanitization.
        // Plain text/layout wrappers no longer cross the JS boundary at all. Initial media indexing is
        // fused into the same selector so prepareMediaFast still avoids separate clone media walks.
        const removals = [];
        const sanitizeSelector = indexMedia
            ? `img,video,script,dialog,[aria-modal="true"],[popover],${POST_SELECTOR},[data-tu-native-source],[id],[data-tu-action-anchor],[style]`
            : `script,dialog,[aria-modal="true"],[popover],${POST_SELECTOR},[data-tu-native-source],[id],[data-tu-action-anchor],[style]`;
        for (const el of clone.querySelectorAll(sanitizeSelector)) {
            const tag = el.tagName;
            if (indexMedia) {
                if (tag === 'IMG') (clone[FAST_CLONE_IMAGES] ||= []).push(el);
                else if (tag === 'VIDEO') (clone[FAST_CLONE_VIDEOS] ||= []).push(el);
            }
            if (tag === 'SCRIPT' || tag === 'DIALOG' || el.getAttribute('aria-modal') === 'true' || el.hasAttribute('popover')) {
                removals.push(el);
                continue;
            }
            if (el.matches?.(POST_SELECTOR)) { el.removeAttribute('tabindex'); el.removeAttribute('data-tu-native-source'); }
            if (el.hasAttribute('data-tu-native-source')) el.removeAttribute('data-tu-native-source');
            if (el.hasAttribute('id')) el.removeAttribute('id');
            if (el.hasAttribute('data-tu-action-anchor')) {
                el.removeAttribute('data-tu-action-anchor');
                for (const prop of ['translate','transform','visibility','opacity','pointer-events','z-index']) el.style.removeProperty(prop);
            }
            if (el.hasAttribute('style')) {
                const pos = el.style.getPropertyValue('position');
                if (pos === 'fixed' || pos === 'sticky') {
                    el.dataset.tuFixedReset = '1';
                    for (const prop of ['position','inset','top','right','bottom','left','transform','translate','z-index']) el.style.removeProperty(prop);
                }
                if (el.style.getPropertyValue('width') === '540px') el.style.setProperty('width', '100%');
                if (el.style.getPropertyValue('min-width')) el.style.removeProperty('min-width');
            }
        }
        for (const el of removals) el.remove();
        for (const prop of ['position','inset','top','right','bottom','left','transform','translate','float','width','max-width','min-width','height','min-height','margin-left','margin-right']) clone.style.removeProperty(prop);
        clone.dataset.tuTextRegionCount = String(markTextOnlyRegions(clone));
        return clone;
    }


    function firstUrlFromSrcset(srcset) {
        if (!srcset) return '';
        return String(srcset).split(',')[0]?.trim().split(/\s+/)[0] || '';
    }

    function parseSrcsetCandidates(srcset) {
        if (!srcset) return [];
        return String(srcset).split(',').map((part) => {
            const bits = part.trim().split(/\s+/);
            const descriptor = bits[bits.length - 1] || '';
            const hasDescriptor = /[wx]$/.test(descriptor);
            const rawUrl = bits.slice(0, hasDescriptor ? -1 : undefined).join(' ') || bits[0] || '';
            const url = mediaUrl(rawUrl) || rawUrl;
            if (!url) return null;
            if (/^[0-9.]+w$/.test(descriptor)) return { url, kind:'w', value:parseFloat(descriptor) };
            if (/^[0-9.]+x$/.test(descriptor)) return { url, kind:'x', value:parseFloat(descriptor) };
            return { url, kind:'x', value:1 };
        }).filter((c) => c?.url && Number.isFinite(c.value));
    }

    function pickSrcsetCandidate(srcset, cssWidth, dpr = devicePixelRatio || 1) {
        const candidates = parseSrcsetCandidates(srcset);
        if (!candidates.length) return '';
        const widthCandidates = candidates.filter((c) => c.kind === 'w').sort((a,b) => a.value - b.value);
        if (widthCandidates.length) {
            const need = Math.max(1, cssWidth) * Math.max(1, dpr);
            return (widthCandidates.find((c) => c.value >= need) || widthCandidates[widthCandidates.length - 1]).url;
        }
        const density = candidates.filter((c) => c.kind === 'x').sort((a,b) => a.value - b.value);
        return (density.find((c) => c.value >= dpr) || density[density.length - 1])?.url || '';
    }

    function simpleSizesPixels(sizes) {
        const match = String(sizes || '').trim().match(/^([0-9.]+)px$/);
        return match ? Math.max(1, parseFloat(match[1])) : 0;
    }

    function mediaUrl(raw) {
        if (!raw) return '';
        try { return new URL(raw, document.baseURI || location.href).href; } catch { return ''; }
    }

    function scheduleBackground(callback, timeout = 180) {
        if (settings.adaptivePerformance && globalThis.scheduler?.postTask) {
            globalThis.scheduler.postTask(callback, { priority: 'background' }).catch(() => setTimeout(callback, 0));
            return;
        }
        if (settings.adaptivePerformance && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => callback(), { timeout });
            return;
        }
        setTimeout(callback, 0);
    }

    function scheduleUserVisible(callback) {
        if (settings.adaptivePerformance && globalThis.scheduler?.postTask) {
            globalThis.scheduler.postTask(callback, { priority: 'user-visible' }).catch(() => requestAnimationFrame(callback));
            return;
        }
        requestAnimationFrame(callback);
    }

    function adaptiveWorkBudget(base = 5) {
        if (!settings.adaptivePerformance) return base;
        const sinceLong = performance.now() - (state.lastLongTaskAt || -1e9);
        if (sinceLong < 1200) return Math.max(2.2, base * .58);
        if ((state.scrollVelocity || 0) > 1.5) return Math.max(2.6, base * .72);
        return Math.min(7, base * 1.08);
    }

    function inputPending() {
        if (!settings.adaptivePerformance) return false;
        try { return Boolean(navigator.scheduling?.isInputPending?.({ includeContinuous:true })); }
        catch { return false; }
    }

    function preconnectOrigin(rawOrigin, countStatic = false) {
        let url;
        try { url = new URL(rawOrigin, location.href); } catch { return false; }
        if (!/^https?:$/.test(url.protocol) || url.origin === location.origin || state.preconnected.has(url.origin)) return false;
        const head = document.head || document.documentElement;
        if (!head) return false;
        state.preconnected.add(url.origin);
        const dns = document.createElement('link');
        dns.rel = 'dns-prefetch';
        dns.href = `//${url.host}`;
        head.appendChild(dns);
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = url.origin;
        head.appendChild(link);
        if (countStatic) state.staticMediaPreconnects += 1;
        return true;
    }

    function preconnectMedia(raw) {
        const href = mediaUrl(raw);
        if (!href) return;
        try { preconnectOrigin(new URL(href).origin, false); } catch {}
    }

    function installStaticMediaPreconnects() {
        if (!siteCapability('staticTumblrMediaPreconnects')) return;
        // Tumblr currently serves the overwhelming majority of dashboard imagery from 64.media and
        // native video from va.media. Opening those transports at document-start removes DNS/TLS from
        // the first hero-image critical path. Dynamic preconnectMedia() still learns any other shard.
        const run = () => {
            for (const origin of ['https://64.media.tumblr.com', 'https://va.media.tumblr.com']) preconnectOrigin(origin, true);
        };
        if (document.head || document.documentElement) run();
        else document.addEventListener('readystatechange', run, { once:true });
    }

    function pictureResponsiveSrcsets(source) {
        const picture = source?.closest?.('picture');
        if (!picture) return { live:'', lazy:'' };
        let live = '', lazy = '';
        for (const candidate of picture.querySelectorAll(':scope > source')) {
            const media = candidate.getAttribute('media') || '';
            if (media) {
                try { if (!matchMedia(media).matches) continue; } catch {}
            }
            if (!live) live = candidate.getAttribute('srcset') || '';
            if (!lazy) lazy = candidate.getAttribute('data-srcset') || candidate.getAttribute('data-lazy-srcset') || '';
            if (live && lazy) break;
        }
        return { live, lazy };
    }

    function eagerImageSource(source) {
        if (!(source instanceof HTMLImageElement)) return { url:'', srcset:'', activeSrcset:'', lazySrcset:'', sizes:'', current:'', decodedLive:'', candidates:[] };
        const dataUrl = source.getAttribute('data-src') || source.getAttribute('data-original') || source.getAttribute('data-lazy-src') || '';
        const imgLazySrcset = source.getAttribute('data-srcset') || source.getAttribute('data-lazy-srcset') || '';
        const direct = source.getAttribute('src') || '';
        const current = source.currentSrc || '';
        const imgLiveSrcset = source.getAttribute('srcset') || '';
        const pictureSets = pictureResponsiveSrcsets(source);
        const activeSrcset = imgLiveSrcset || pictureSets.live || '';
        const lazySrcset = imgLazySrcset || pictureSets.lazy || '';
        // Prefer deferred metadata as the candidate catalogue when it exists, but keep the active
        // responsive set separately because Chromium may already be fetching its predicted resource.
        const srcset = lazySrcset || activeSrcset || '';
        const sizes = source.getAttribute('sizes') || '';
        const decodedLive = source.complete && source.naturalWidth > 0 ? current : '';
        const all = [...parseSrcsetCandidates(srcset), ...parseSrcsetCandidates(activeSrcset)];
        const seen = new Set();
        const candidates = all.filter((candidate) => {
            const key = `${mediaUrl(candidate.url)}|${candidate.kind}|${candidate.value}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
        return {
            url: mediaUrl(dataUrl || direct || current || firstUrlFromSrcset(srcset)),
            srcset,
            activeSrcset,
            lazySrcset,
            sizes,
            current: mediaUrl(current),
            decodedLive: mediaUrl(decodedLive),
            candidates,
        };
    }

    function estimatedCardWidth(record) {
        // state.cardWidth is refreshed whenever the deck geometry changes. Reuse it on the hot media
        // path so every image does not force another shell clientWidth read/layout flush.
        if (state.cardWidth > 80) return state.cardWidth;
        const cols = Math.max(1, state.actualColumns || 1);
        const shellWidth = state.shell?.clientWidth || 0;
        const computed = shellWidth > 0 ? (shellWidth - Math.max(0, cols - 1) * settings.gap - 4) / cols : 0;
        return Math.max(1, computed > 80 ? computed : (record?.nativeCardWidth || 320));
    }

    function displayDpr() {
        // 2x is already retina-sharp in this dense deck. Capping the request avoids wasting bandwidth
        // on 3x/4x resources that cannot become visibly sharper at these card sizes.
        return clamp(Number(devicePixelRatio) || 1, 1, 2);
    }

    function candidateDescriptorForUrl(candidates, url) {
        const wanted = mediaUrl(url);
        return candidates.find((candidate) => mediaUrl(candidate.url) === wanted) || null;
    }

    function fastLiveResponsiveHint(source, record) {
        if (!(source instanceof HTMLImageElement)) return null;
        if (source.getAttribute('data-srcset') || source.getAttribute('data-lazy-srcset') || source.getAttribute('data-src') || source.getAttribute('data-original') || source.getAttribute('data-lazy-src')) return null;
        const pictureSets = pictureResponsiveSrcsets(source);
        const activeSrcset = source.getAttribute('srcset') || pictureSets.live || '';
        const current = mediaUrl(source.currentSrc || '');
        if (!activeSrcset || !current) return null;
        const targetCss = estimatedCardWidth(record);
        const dpr = displayDpr();
        const nativeCss = Math.max(1, simpleSizesPixels(source.getAttribute('sizes') || '') || record?.nativeCardWidth || source.width || targetCss);
        // currentSrc was selected by Chromium for the native slot. If the deck card is no wider,
        // that exact in-flight resource is already display-sufficient and needs no srcset parsing.
        if (targetCss > nativeCss * 1.08) return null;
        const targetPhysical = Math.max(1, targetCss * dpr);
        return {
            url: mediaUrl(source.getAttribute('src') || current),
            srcset: activeSrcset,
            activeSrcset,
            lazySrcset:'',
            sizes: source.getAttribute('sizes') || '',
            current,
            decodedLive: source.complete && source.naturalWidth > 0 ? current : '',
            candidates:[],
            chosen:current,
            targetCss,
            targetPhysical,
            expectedWidth:Math.max(targetPhysical, source.naturalWidth || 0),
            currentEnough:true,
            expectedNative:current,
            rejectedPlaceholder:false,
        };
    }

    function chooseDisplayImage(source, record) {
        const info = eagerImageSource(source);
        const targetCss = estimatedCardWidth(record);
        const dpr = displayDpr();
        const targetPhysical = Math.max(1, targetCss * dpr);
        const widthCandidates = info.candidates.filter((c) => c.kind === 'w').sort((a,b) => a.value - b.value);
        const densityCandidates = info.candidates.filter((c) => c.kind === 'x').sort((a,b) => a.value - b.value);
        let responsive = null;
        if (widthCandidates.length) responsive = widthCandidates.find((c) => c.value >= targetPhysical * .96) || widthCandidates[widthCandidates.length - 1];
        else if (densityCandidates.length) responsive = densityCandidates.find((c) => c.value >= dpr) || densityCandidates[densityCandidates.length - 1];

        const currentDescriptor = candidateDescriptorForUrl(info.candidates, info.current);
        const currentIntrinsic = source.complete && source.naturalWidth > 0 ? source.naturalWidth : 0;
        const descriptorEnough = currentDescriptor?.kind === 'w' ? currentDescriptor.value >= targetPhysical * .82
            : currentDescriptor?.kind === 'x' ? currentDescriptor.value >= dpr * .82 : false;
        const intrinsicEnough = currentIntrinsic >= targetPhysical * .82;
        const currentEnough = Boolean(info.current) && (descriptorEnough || intrinsicEnough || (responsive && mediaUrl(responsive.url) === info.current));

        // When Tumblr already has a real srcset attached, predict the resource Chromium is going to
        // request for its native 540px-ish slot. Reusing that exact URL lets the browser coalesce the
        // native and mirror requests instead of downloading a second deck-sized rendition.
        const nativeCssWidth = Math.max(1, simpleSizesPixels(info.sizes) || record?.nativeCardWidth || source.width || targetCss);
        const expectedNative = info.activeSrcset ? mediaUrl(pickSrcsetCandidate(info.activeSrcset, nativeCssWidth, dpr)) : '';
        const expectedNativeDescriptor = candidateDescriptorForUrl(info.candidates, expectedNative);
        const expectedNativeEnough = Boolean(expectedNative) && (
            expectedNativeDescriptor?.kind === 'w' ? expectedNativeDescriptor.value >= targetPhysical * .82
            : expectedNativeDescriptor?.kind === 'x' ? expectedNativeDescriptor.value >= dpr * .82
            : nativeCssWidth >= targetCss * .82
        );

        // Critical v6 rule: a merely-present currentSrc is NOT proof of quality. Tumblr frequently
        // starts lazy images on a tiny blur/LQIP. Use an already-good current resource first; otherwise
        // coalesce with the active native responsive request; otherwise request the deck candidate.
        let chosen = '';
        if (currentEnough) chosen = info.current;
        else if (expectedNativeEnough) chosen = expectedNative;
        else if (responsive?.url) chosen = mediaUrl(responsive.url);
        else if (info.url) chosen = info.url;
        else if (info.current) chosen = info.current;

        const chosenDescriptor = candidateDescriptorForUrl(info.candidates, chosen);
        const expectedWidth = chosenDescriptor?.kind === 'w' ? chosenDescriptor.value
            : chosenDescriptor?.kind === 'x' ? targetCss * chosenDescriptor.value
            : 0;
        // currentSrc is often still empty during React's first paint even though `src` already points
        // at a 32-64px LQIP. Treat that direct fallback as a placeholder too when a different
        // responsive/deferred candidate has been selected. This lets the mirror remove Tumblr's
        // heavy blur/near-zero opacity immediately while the HQ request is already in flight.
        const directFallback = mediaUrl(source.getAttribute('src') || '');
        const visibleFallback = info.current || directFallback;
        const rejectedPlaceholder = Boolean(visibleFallback && chosen && visibleFallback !== chosen && !currentEnough && (responsive || info.lazySrcset || info.url !== visibleFallback));
        return { ...info, chosen, targetCss, targetPhysical, expectedWidth, currentEnough, expectedNative, rejectedPlaceholder };
    }

    function earlyAvailableWidthEstimate() {
        const viewport = Math.max(320, document.documentElement?.clientWidth || innerWidth || 1280);
        let available = viewport - settings.gutter * 2 - 8;
        // At document-start the full rail discovery pass has not run yet, but Tumblr normally inserts
        // its left nav/right sidebar in the same React commit as the first posts. A cheap one-time-ish
        // geometry read prevents the accelerator from warming a one-column-sized 1280px image for a
        // card that will actually be ~300px wide once those rails are reserved.
        const left = document.querySelector('a[href="/dashboard"]')?.closest?.('nav,[role="navigation"]') || document.querySelector('nav[role="navigation"],nav');
        const right = document.querySelector('aside[role="complementary"],aside[aria-label*="Sidebar" i],aside');
        for (const [side, el] of [['left', left], ['right', right]]) {
            if (!(el instanceof HTMLElement)) continue;
            try {
                const r = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                if (r.width <= 20 || r.height <= 20 || style.display === 'none' || style.visibility === 'hidden') continue;
                if (side === 'left' && r.left < viewport * .45) available -= r.width + settings.gap;
                if (side === 'right' && r.right > viewport * .55) available -= r.width + settings.gap;
            } catch {}
        }
        return Math.max(320, available);
    }

    function estimatedEarlyColumns() {
        const available = earlyAvailableWidthEstimate();
        return settings.columns === 'auto'
            ? clamp(Math.floor((available + settings.gap) / (settings.minCardWidth + settings.gap)), 1, settings.maxColumns)
            : clamp(Number(settings.columns) || 1, 1, settings.maxColumns);
    }

    function refreshDeckMetrics() {
        const shell = state.shell;
        if (!shell?.isConnected) return;
        const actualWidth = Math.max(1, shell.clientWidth - 4);
        state.measuredShellWidth = actualWidth;
        state.deckScrollTop = shell.scrollTop || 0;
        state.deckClientHeight = shell.clientHeight || 0;
        state.deckScrollHeight = shell.scrollHeight || 0;
        state.deckRemaining = Math.max(0, state.deckScrollHeight - (state.deckScrollTop + state.deckClientHeight));
        // Geometry updates use a viewport-derived width estimate so they never write shell offsets and
        // immediately force layout by reading clientWidth. Reconcile the exact scrollbar-adjusted width
        // here, after the deck is already usable or when a real scroll/diagnostic read needs metrics.
        if (Math.abs(actualWidth - (state.layoutWidth || 0)) > 2) applyColumns(actualWidth);
    }

    function scheduleDeckMetrics(delay = 900) {
        clearTimeout(state.deckMetricsTimer);
        state.deckMetricsTimer = setTimeout(() => {
            state.deckMetricsTimer = 0;
            refreshDeckMetrics();
        }, Math.max(0, delay));
    }

    function mediaPriority(record) {
        const columns = Math.max(1, state.actualColumns || estimatedEarlyColumns());
        // Every mirror begins loading immediately. Priority controls only the browser's network
        // scheduler. Keep the first visible rows critical, and when the user is actually near the
        // deck bottom promote the just-arrived batch instead of leaving newly visible cards at low.
        if (record.sequence < Math.max(16, columns * 2)) return 'high';
        if (state.shell?.isConnected) {
            // A detached capture batch has no meaningful deck scroll geometry yet. Reading shell
            // scrollHeight here forces layout against an empty/incomplete deck and incorrectly makes
            // every newly built card look "near the bottom". Initial batches therefore stay on the
            // sequence tiers below until the real deck is committed. Incremental scroll batches keep
            // using the already-finite live metrics populated by onDeckScroll().
            if (!Number.isFinite(state.deckRemaining) && !record?.pendingPlacement) refreshDeckMetrics();
            if (Number.isFinite(state.deckRemaining)) {
                const newestCutoff = Math.max(0, state.cache.size - Math.max(12, columns * 3));
                if (state.deckRemaining < Math.max(2200, state.deckClientHeight * 2.4) && record.sequence >= newestCutoff) return 'high';
            }
        }
        if (record.sequence < Math.max(56, columns * 6)) return 'auto';
        return 'low';
    }

    function preloadImageUrl(raw, priority = 'high') {
        const url = mediaUrl(raw);
        if (!url || priority !== 'high') return null;
        const existing = state.mediaPreloads.get(url);
        if (existing) {
            state.mediaPreloadHits += 1;
            try {
                existing.link.setAttribute('fetchpriority', 'high');
                if ('fetchPriority' in existing.link) existing.link.fetchPriority = 'high';
            } catch {}
            return existing;
        }
        const head = document.head || document.documentElement;
        if (!head) return null;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        // Intentionally omit crossorigin. Normal Tumblr <img> requests use no-CORS image mode; using
        // crossorigin=anonymous here can create a preload with a different request key that the later
        // <img> cannot reuse. Matching request semantics is more important than decorative attributes.
        try {
            link.setAttribute('fetchpriority', 'high');
            if ('fetchPriority' in link) link.fetchPriority = 'high';
        } catch {}
        const entry = { link, url, startedAt:performance.now(), done:false, handedOff:false };
        const finish = (ok) => {
            if (entry.done) return;
            entry.done = true;
            if (ok) state.mediaPreloadCompleted += 1;
            else state.mediaPreloadErrors += 1;
            // Keep the preload node alive briefly after completion so a React mount in the next few
            // frames still matches the exact resource and reuses the already-scheduled response.
            setTimeout(() => {
                if (entry.handedOff && entry.link.isConnected) entry.link.remove();
                if (entry.handedOff && state.mediaPreloads.get(url) === entry) state.mediaPreloads.delete(url);
            }, 4000);
        };
        link.addEventListener('load', () => finish(true), { once:true });
        link.addEventListener('error', () => finish(false), { once:true });
        state.mediaPreloads.set(url, entry);
        state.mediaPreloadStarts += 1;
        state.mediaPreloadPeak = Math.max(state.mediaPreloadPeak, state.mediaPreloads.size);
        state.mediaHeroSchedules += 1;
        if (!state.mediaHeroFirstScheduleAt) state.mediaHeroFirstScheduleAt = performance.now();
        preconnectMedia(url);
        head.appendChild(link);
        return entry;
    }

    function warmImageUrl(raw, priority = 'auto') {
        const url = mediaUrl(raw);
        if (!url) return null;
        // Submit critical heroes to the browser's preload scanner before creating the detached image.
        // The subsequent Image uses the exact same URL/request mode, so Chromium can coalesce it while
        // still giving us decode() and completion signals. This is faster than waiting for React DOM.
        if (priority === 'high') preloadImageUrl(url, 'high');
        const existing = state.mediaWarmers.get(url);
        if (existing) {
            state.mediaWarmHits += 1;
            if (priority === 'high' && 'fetchPriority' in existing.image) existing.image.fetchPriority = 'high';
            return existing;
        }
        const image = new Image();
        applyImagePriority(image, priority);
        const entry = { image, url, startedAt: performance.now(), done: false, handedOff: false };
        state.mediaWarmers.set(url, entry);
        state.mediaWarmStarts += 1;
        const finish = () => {
            if (entry.done) return;
            entry.done = true;
            state.mediaWarmCompleted += 1;
            if (priority === 'high' && typeof image.decode === 'function') {
                Promise.resolve(image.decode()).then(() => { state.mediaWarmDecoded += 1; }).catch(() => {});
            }
            setTimeout(() => {
                if (state.mediaWarmers.get(url) === entry) state.mediaWarmers.delete(url);
            }, 5000);
        };
        image.addEventListener('load', finish, { once:true });
        image.addEventListener('error', finish, { once:true });
        preconnectMedia(url);
        image.src = url;
        return entry;
    }

    function handOffWarmImage(raw) {
        const url = mediaUrl(raw);
        if (!url) return;
        const entry = state.mediaWarmers.get(url);
        if (entry && !entry.handedOff) {
            entry.handedOff = true;
            state.mediaWarmHandedOff += 1;
        }
        const preload = state.mediaPreloads.get(url);
        if (preload && !preload.handedOff) {
            preload.handedOff = true;
            state.mediaPreloadHandedOff += 1;
            setTimeout(() => {
                if (preload.link.isConnected) preload.link.remove();
                if (state.mediaPreloads.get(url) === preload) state.mediaPreloads.delete(url);
            }, preload.done ? 1200 : 8000);
        }
    }

    function isTumblrMediaPayloadUrl(raw) {
        try {
            const url = new URL(raw || '', location.href);
            const host = url.hostname.toLowerCase();
            if (!(host === 'tumblr.com' || host.endsWith('.tumblr.com'))) return false;
            return /\/(?:api\/)?v2\//.test(url.pathname);
        } catch { return false; }
    }

    function selectNpfMediaCandidate(media, targetPhysical) {
        if (!Array.isArray(media) || !media.length) return null;
        const candidates = media.map((item) => {
            if (!item || typeof item !== 'object') return null;
            const url = mediaUrl(item.url || '');
            const width = Number(item.width || 0);
            const height = Number(item.height || 0);
            const type = String(item.type || '').toLowerCase();
            if (!url || !(width > 0) || (type && !type.startsWith('image/'))) return null;
            return { url, width, height };
        }).filter(Boolean).sort((a,b) => a.width - b.width);
        if (!candidates.length) return null;
        const need = Math.max(1, Number(targetPhysical) || 1);
        return candidates.find((candidate) => candidate.width >= need * .96) || candidates[candidates.length - 1];
    }

    function npfGroupsForPostObject(post) {
        if (!post || typeof post !== 'object') return [];
        const groups = [];
        const addContent = (content) => {
            if (!Array.isArray(content)) return;
            for (const block of content) {
                if (block?.type === 'image' && Array.isArray(block.media) && block.media.length) groups.push(block.media);
            }
        };
        // Tumblr renders trail blocks as part of the same post. Keep their image groups in DOM order
        // ahead of the current post body, then append the current post content.
        if (Array.isArray(post.trail)) for (const trail of post.trail) addContent(trail?.content);
        addContent(post.content);
        return groups;
    }

    function npfHintForSourceImage(source, record) {
        if (!(source instanceof HTMLImageElement)) return null;
        const post = closestSourcePost(source);
        const id = record?.id || postId(post);
        const groups = state.apiPostMediaHints.get(String(id || ''));
        if (!groups?.length || !post) return null;
        // Current Tumblr NPF image blocks are rendered as figure images. Restrict the API-to-DOM
        // ordinal mapping to figure images so avatars, badges, blog icons, and reaction chrome can
        // never accidentally inherit a post-media URL.
        if (!source.closest('figure')) return null;
        let mapping = state.apiPostDomMappings.get(post);
        if (!mapping || mapping.groups !== groups || !mapping.byImage.has(source)) {
            const byImage = new WeakMap();
            const figures = [...post.querySelectorAll('figure img')];
            for (let index = 0; index < Math.min(figures.length, groups.length); index += 1) byImage.set(figures[index], groups[index]);
            mapping = { groups, byImage };
            state.apiPostDomMappings.set(post, mapping);
            state.apiPostHintMapBuilds += 1;
        }
        const media = mapping.byImage.get(source);
        if (!media) return null;
        const targetCss = estimatedCardWidth(record);
        const targetPhysical = Math.max(1, targetCss * displayDpr());
        const picked = selectNpfMediaCandidate(media, targetPhysical);
        if (!picked?.url) return null;
        const current = mediaUrl(source.currentSrc || source.getAttribute('src') || '');
        state.apiPostHintUses += 1;
        return {
            ...eagerImageSource(source),
            chosen:picked.url,
            targetCss,
            targetPhysical,
            expectedWidth:picked.width,
            currentEnough:Boolean(current && source.complete && source.naturalWidth >= targetPhysical * .82),
            expectedNative:'',
            rejectedPlaceholder:Boolean(current && current !== picked.url && (!source.complete || source.naturalWidth < targetPhysical * .82)),
            apiHint:true,
        };
    }

    function apiCriticalPostBudget(extraRows = 0) {
        const columns = Math.max(1, estimatedEarlyColumns());
        let fastTransport = true;
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection?.saveData) fastTransport = false;
            if (/^(?:slow-2g|2g)$/.test(String(connection?.effectiveType || ''))) fastTransport = false;
        } catch {}
        // On ultrawide screens the first visual viewport can contain substantially more than two
        // masonry rows. Give a third row true high-priority treatment only when the transport is not
        // explicitly constrained, while keeping a hard cap so deep galleries never starve heroes.
        const baseRows = fastTransport && Math.max(innerWidth || 0, document.documentElement?.clientWidth || 0) >= 1800 ? 3 : 2;
        return clamp(columns * (baseRows + Math.max(0, extraRows)), 12, 72);
    }

    function refreshApiHighBudget(extraRows = 0) {
        state.apiHeroWavePrimed = true;
        state.apiHighPostBudgetRemaining = Math.max(
            state.apiHighPostBudgetRemaining || 0,
            apiCriticalPostBudget(extraRows),
        );
    }

    function warmNpfMediaGroup(media, targetPhysical, priority, kind = 'secondary') {
        const picked = selectNpfMediaCandidate(media, targetPhysical);
        const url = picked?.url || '';
        if (!url || state.apiMediaUrls.has(url)) return false;
        state.apiMediaUrls.add(url);
        warmImageUrl(url, priority);
        state.apiMediaStarts += 1;
        if (priority === 'high') state.apiMediaHighStarts += 1;
        if (kind === 'hero') state.apiMediaHeroStarts += 1;
        else state.apiMediaSecondaryStarts += 1;
        return true;
    }

    function harvestNpfMediaPayload(payload, responseUrl = '', deferSecondary = true) {
        if (!settings.turboMedia || !payload || typeof payload !== 'object') return;
        const targetPhysical = Math.max(1, earlyDeckWidthEstimate() * displayDpr());
        if (!state.apiHeroWavePrimed) refreshApiHighBudget(0);

        const stack = [payload];
        const seen = new WeakSet();
        const ownedMedia = new WeakSet();
        const secondaryGroups = [];
        const looseGroups = [];
        let blocks = 0;
        const startsBefore = state.apiMediaStarts;

        // Critical hot path: do not wait for a complete recursive payload walk before asking
        // Chromium for the first sharp image. As soon as a post object is encountered, derive its
        // NPF image groups and start that post's hero request immediately. We then skip traversing
        // the post's content/trail again because npfGroupsForPostObject() already consumed them.
        // This keeps the synchronous Response.json hook shallow while letting hero network work
        // begin before Tumblr/React receives the resolved payload.
        while (stack.length) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            if (seen.has(node)) continue;
            seen.add(node);

            let skipPostContent = false;
            if (!Array.isArray(node)) {
                const id = String(node.id || node.post_id || '').trim();
                if (id && (Array.isArray(node.content) || Array.isArray(node.trail))) {
                    const groups = npfGroupsForPostObject(node);
                    if (groups.length) {
                        skipPostContent = true;
                        blocks += groups.length;
                        for (const group of groups) if (group && typeof group === 'object') ownedMedia.add(group);
                        if (!state.apiPostMediaHints.has(id)) state.apiPostHintsStored += 1;
                        state.apiPostMediaHints.set(id, groups);
                        // A retained card can already exist when a late or cached timeline payload is
                        // parsed. Queue a rescue immediately so a virtualized-away native source is
                        // not allowed to strand that retained card on Tumblr's tiny LQIP forever.
                        const retained = state.cache.get(id);
                        if (retained?.clone) queueMediaSync(retained);

                        const high = state.apiHighPostBudgetRemaining > 0;
                        if (warmNpfMediaGroup(groups[0], targetPhysical, high ? 'high' : 'auto', 'hero') && high) {
                            state.apiHighPostBudgetRemaining -= 1;
                        }
                        if (groups.length > 1) secondaryGroups.push(...groups.slice(1));
                    }
                }
                if (!skipPostContent && node.type === 'image' && Array.isArray(node.media) && node.media.length && !ownedMedia.has(node.media)) {
                    blocks += 1;
                    looseGroups.push(node.media);
                }
            }

            if (Array.isArray(node)) {
                for (let i = node.length - 1; i >= 0; i -= 1) {
                    const value = node[i];
                    if (value && typeof value === 'object') stack.push(value);
                }
            } else {
                const entries = Object.entries(node);
                for (let i = entries.length - 1; i >= 0; i -= 1) {
                    const [key, value] = entries[i];
                    if (skipPostContent && (key === 'content' || key === 'trail')) continue;
                    if (value && typeof value === 'object') stack.push(value);
                }
            }
        }

        const fillSecondary = () => {
            // Only after the hero wave has been submitted do we fill galleries. This preserves a
            // sharp first image across the wall instead of letting deep galleries consume the
            // connection pool while neighbouring cards are still LQIP placeholders.
            for (const media of secondaryGroups) warmNpfMediaGroup(media, targetPhysical, 'auto', 'secondary');
            for (const media of looseGroups) warmNpfMediaGroup(media, targetPhysical, 'auto', 'secondary');
        };
        if (deferSecondary && (secondaryGroups.length || looseGroups.length)) setTimeout(fillSecondary, 0);
        else fillSecondary();

        state.apiMediaScans += 1;
        state.apiMediaBlocks += blocks;
        if (state.apiMediaStarts > startsBefore) state.lastApiMediaAt = performance.now();
        void responseUrl;
    }

    function scheduleNpfMediaPayload(payload, responseUrl = '') {
        if (!settings.turboMedia || !payload || typeof payload !== 'object') return false;
        // Response.json() and window.tumblr.apiFetch() can expose the same object. Keep the hot path
        // single-pass so the extra official-api hook improves launch time without doubling traversal.
        try {
            if (state.apiPayloadSeen.has(payload)) return false;
            state.apiPayloadSeen.add(payload);
        } catch {}
        // Run the bounded hero scan synchronously in the API fulfillment callback. Hero requests are
        // therefore submitted before Tumblr/React receives the payload and before any LQIP DOM can
        // become the only visible resource. Deep galleries remain next-task work so they cannot steal
        // the initial connection pool from neighbouring hero images.
        try { harvestNpfMediaPayload(payload, responseUrl, true); return true; } catch { return false; }
    }

    function installTumblrApiFetchAccelerator() {
        if (!siteCapability('tumblrNpfMedia') || !settings.turboMedia || state.tumblrApiFetchHookInstalled) return;
        const started = performance.now();
        const tryInstall = () => {
            if (state.tumblrApiFetchHookInstalled) return;
            state.tumblrApiFetchHookAttempts += 1;
            const tumblr = window.tumblr;
            const nativeApiFetch = tumblr?.apiFetch;
            if (tumblr && typeof nativeApiFetch === 'function') {
                if (nativeApiFetch.__tuUltraDeckWrapped) {
                    state.tumblrApiFetchHookInstalled = true;
                    return;
                }
                const wrappedApiFetch = function(resource, init) {
                    const result = nativeApiFetch.apply(this, arguments);
                    // Official Tumblr web-platform apiFetch resolves directly to parsed JSON. Hooking
                    // this public surface is both earlier and more reliable than guessing which private
                    // fetch/XHR implementation the current React build happens to use. Preserve the
                    // original Promise semantics exactly and inspect only successful v2 JSON results.
                    return Promise.resolve(result).then((payload) => {
                        state.tumblrApiFetchResponses += 1;
                        let mediaCandidate = false;
                        try {
                            const absolute = new URL(String(resource || ''), document.baseURI || location.href).href;
                            mediaCandidate = isTumblrMediaPayloadUrl(absolute);
                            if (mediaCandidate && scheduleNpfMediaPayload(payload, absolute)) state.tumblrApiFetchMediaResponses += 1;
                        } catch {}
                        return payload;
                    });
                };
                try {
                    Object.defineProperty(wrappedApiFetch, '__tuUltraDeckWrapped', { value:true });
                    Object.defineProperty(wrappedApiFetch, '__tuUltraDeckOriginal', { value:nativeApiFetch });
                    tumblr.apiFetch = wrappedApiFetch;
                    if (tumblr.apiFetch === wrappedApiFetch) {
                        state.tumblrApiFetchHookInstalled = true;
                        return;
                    }
                } catch {}
            }
            // Tumblr defines window.tumblr during boot. A short rAF probe installs the wrapper as soon
            // as its official extension API exists, then disappears completely. No persistent polling.
            if (performance.now() - started < 10000) requestAnimationFrame(tryInstall);
        };
        tryInstall();
    }

    function installNpfMediaAccelerator() {
        if (!siteCapability('tumblrNpfMedia') || !settings.turboMedia || state.apiMediaHookInstalled) return;
        state.apiMediaHookInstalled = true;
        try {
            const proto = globalThis.Response?.prototype;
            const nativeJson = proto?.json;
            if (proto && typeof nativeJson === 'function' && !nativeJson.__tuUltraDeckWrapped) {
                const wrappedJson = function(...args) {
                    const responseUrl = this?.url || '';
                    const promise = nativeJson.apply(this, args);
                    if (!isTumblrMediaPayloadUrl(responseUrl)) return promise;
                    return promise.then((payload) => {
                        scheduleNpfMediaPayload(payload, responseUrl);
                        return payload;
                    });
                };
                Object.defineProperty(wrappedJson, '__tuUltraDeckWrapped', { value:true });
                Object.defineProperty(wrappedJson, '__tuUltraDeckOriginal', { value:nativeJson });
                proto.json = wrappedJson;
            }
        } catch {}
        try {
            const proto = globalThis.XMLHttpRequest?.prototype;
            const nativeOpen = proto?.open;
            const nativeSend = proto?.send;
            if (proto && typeof nativeOpen === 'function' && typeof nativeSend === 'function' && !nativeOpen.__tuUltraDeckWrapped) {
                const wrappedOpen = function(method, url, ...rest) {
                    try { this.__tuUltraDeckUrl = new URL(String(url || ''), location.href).href; } catch { this.__tuUltraDeckUrl = String(url || ''); }
                    return nativeOpen.call(this, method, url, ...rest);
                };
                Object.defineProperty(wrappedOpen, '__tuUltraDeckWrapped', { value:true });
                Object.defineProperty(wrappedOpen, '__tuUltraDeckOriginal', { value:nativeOpen });
                const wrappedSend = function(...args) {
                    if (!this.__tuUltraDeckMediaHooked) {
                        this.__tuUltraDeckMediaHooked = true;
                        this.addEventListener('load', () => {
                            try {
                                if (!isTumblrMediaPayloadUrl(this.responseURL || this.__tuUltraDeckUrl)) return;
                                if (this.responseType === 'json' && this.response && typeof this.response === 'object') {
                                    scheduleNpfMediaPayload(this.response, this.responseURL || this.__tuUltraDeckUrl);
                                }
                            } catch {}
                        }, { once:true });
                    }
                    return nativeSend.apply(this, args);
                };
                Object.defineProperty(wrappedSend, '__tuUltraDeckWrapped', { value:true });
                Object.defineProperty(wrappedSend, '__tuUltraDeckOriginal', { value:nativeSend });
                proto.open = wrappedOpen;
                proto.send = wrappedSend;
            }
        } catch {}
    }

    function prewarmSourceImages(sourcePost, record) {
        if (!settings.turboMedia || !(sourcePost instanceof Element)) return [];
        const priority = mediaPriority(record);
        const hints = [];
        const images = [];
        const videos = [];
        for (const media of sourcePost.querySelectorAll('img,video')) {
            if (media instanceof HTMLImageElement) images.push(media);
            else if (media instanceof HTMLVideoElement) videos.push(media);
        }
        // Carry the exact native media nodes found during this traversal into the synchronous clone
        // priming pass. This collapses three source-side selector walks into one without retaining the
        // references after first paint; late React media changes still use the normal live resync path.
        hints.sourceImages = images;
        hints.sourceVideos = videos;
        for (let index = 0; index < images.length; index += 1) {
            const source = images[index];
            // Prime the live Tumblr node before clone/sanitize work. This gives the browser a head
            // start on DNS/connection/resource fetch while we build the card, which matters most on
            // large posts containing hundreds of descendants.
            applyImagePriority(source, priority);
            let resolved = npfHintForSourceImage(source, record) || fastLiveResponsiveHint(source, record) || chooseDisplayImage(source, record);
            const early = state.earlyMediaHints.get(source);
            if (early?.chosen && Number(early.expectedWidth || 0) >= resolved.targetPhysical * .82) {
                resolved = { ...early, targetCss:resolved.targetCss, targetPhysical:resolved.targetPhysical, rejectedPlaceholder:Boolean(resolved.rejectedPlaceholder || early.rejectedPlaceholder) };
            }
            hints[index] = resolved;
            // A live srcset on the source already lets Chromium start the exact native resource as
            // soon as we flip loading=eager. Creating a second Image object there only adds JS work.
            // Warm explicitly when the useful candidates exist only in deferred/lazy metadata, which
            // is the Tumblr LQIP case that otherwise remains blurred after the native cell is hidden.
            if (resolved.chosen && !resolved.activeSrcset) warmImageUrl(resolved.chosen, priority);
            else preconnectMedia(resolved.chosen || resolved.current || resolved.url);
        }
        return hints;
    }

    function earlyDeckWidthEstimate() {
        const available = earlyAvailableWidthEstimate();
        const columns = estimatedEarlyColumns();
        return Math.max(1, (available - settings.gap * Math.max(0, columns - 1)) / columns);
    }

    function instantMediaSignature(image) {
        return [
            image.getAttribute('data-srcset'), image.getAttribute('data-lazy-srcset'),
            image.getAttribute('data-src'), image.getAttribute('data-original'), image.getAttribute('data-lazy-src'),
            image.getAttribute('srcset'), image.getAttribute('sizes'), image.getAttribute('src'),
        ].join('|');
    }

    function instantCandidateWideEnough(resolved) {
        if (!resolved?.chosen) return false;
        if (!resolved.candidates?.length || !resolved.expectedWidth) return true;
        const minimumUseful = Math.min(240, Math.max(96, resolved.targetPhysical * .48));
        return resolved.expectedWidth >= minimumUseful;
    }

    function primeInstantLazyImage(image, reason = 'attribute') {
        if (!settings.turboMedia || !(image instanceof HTMLImageElement) || state.shell?.contains(image)) return false;
        const hasDeferred = Boolean(
            image.getAttribute('data-srcset') || image.getAttribute('data-lazy-srcset') ||
            image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('data-lazy-src')
        );
        if (!hasDeferred && reason !== 'srcset') return false;
        const signature = instantMediaSignature(image);
        if (state.instantMediaSeen.get(image) === signature) return false;
        state.instantMediaSeen.set(image, signature);
        const target = earlyDeckWidthEstimate();
        const record = { sequence:state.instantMediaPrimed, nativeCardWidth:target };
        const resolved = chooseDisplayImage(image, record);
        if (!instantCandidateWideEnough(resolved)) return false;
        const priority = state.instantMediaPrimed < apiCriticalPostBudget(0) ? 'high' : 'auto';
        state.instantMediaMutating.add(image);
        try {
            image.loading = 'eager';
            image.decoding = priority === 'high' ? 'auto' : 'async';
            if ('fetchPriority' in image) image.fetchPriority = priority;
        } catch {}
        state.instantMediaMutating.delete(image);
        // Deferred srcset/data-src is exactly the state that leaves Tumblr showing a blur placeholder.
        // Start the selected display-sufficient resource synchronously inside the same JS task that
        // published that metadata, rather than waiting for MutationObserver or card cloning.
        if (resolved.chosen && (hasDeferred || !resolved.activeSrcset)) {
            const before = state.mediaWarmStarts;
            warmImageUrl(resolved.chosen, priority);
            if (state.mediaWarmStarts > before) state.instantMediaWarmStarts += 1;
        } else {
            preconnectMedia(resolved.chosen || resolved.current || resolved.url);
        }
        state.earlyMediaHints.set(image, resolved);
        state.instantMediaPrimed += 1;
        return true;
    }

    function primeInstantSource(source, rawSrcset) {
        if (!settings.turboMedia || !(source instanceof HTMLSourceElement) || !rawSrcset) return false;
        const target = earlyDeckWidthEstimate();
        const chosen = pickSrcsetCandidate(rawSrcset, target, displayDpr());
        if (!chosen) return false;
        const priority = state.instantMediaPrimed < apiCriticalPostBudget(0) ? 'high' : 'auto';
        const before = state.mediaWarmStarts;
        warmImageUrl(chosen, priority);
        if (state.mediaWarmStarts > before) state.instantMediaWarmStarts += 1;
        state.instantMediaPrimed += 1;
        return true;
    }

    function installInstantMediaAttributeAccelerator() {
        if (!settings.turboMedia || state.instantMediaHookInstalled) return;
        state.instantMediaHookInstalled = true;
        const installSetAttributeHook = (proto, kind) => {
            try {
                const inherited = proto?.setAttribute;
                if (typeof inherited !== 'function' || inherited.__tuInstantMediaWrapped) return;
                const wrapped = function(name, value) {
                    const attr = String(name || '').toLowerCase();
                    const relevant = kind === 'image'
                        ? /^(?:data-srcset|data-lazy-srcset|data-src|data-original|data-lazy-src|srcset|sizes)$/.test(attr)
                        : /^(?:data-srcset|data-lazy-srcset|srcset)$/.test(attr);
                    // Priority must exist before an active srcset is committed, otherwise Chromium may
                    // already have scheduled the request at its default priority. This path is tiny and
                    // only runs for image/source elements, not every Element.setAttribute call on Tumblr.
                    if (relevant && attr === 'srcset' && kind === 'image' && !state.instantMediaMutating.has(this)) {
                        const candidates = parseSrcsetCandidates(value);
                        const wide = candidates.some((candidate) => candidate.kind !== 'w' || candidate.value >= 240);
                        if (wide && state.instantResponsivePriorities < apiCriticalPostBudget(0)) {
                            try {
                                this.loading = 'eager';
                                this.decoding = 'auto';
                                if ('fetchPriority' in this) this.fetchPriority = 'high';
                                state.instantResponsivePriorities += 1;
                            } catch {}
                        }
                    }
                    const result = inherited.call(this, name, value);
                    if (!relevant || state.instantMediaMutating.has(this)) return result;
                    if (kind === 'image') primeInstantLazyImage(this, attr === 'srcset' ? 'srcset' : 'attribute');
                    else if (attr.includes('srcset')) primeInstantSource(this, String(value || ''));
                    return result;
                };
                Object.defineProperty(wrapped, '__tuInstantMediaWrapped', { value:true });
                Object.defineProperty(wrapped, '__tuInstantMediaOriginal', { value:inherited });
                Object.defineProperty(proto, 'setAttribute', { configurable:true, writable:true, value:wrapped });
            } catch {}
        };
        installSetAttributeHook(globalThis.HTMLImageElement?.prototype, 'image');
        installSetAttributeHook(globalThis.HTMLSourceElement?.prototype, 'source');

        // React commonly assigns img.srcset through the DOM property rather than setAttribute().
        // Wrap only that property and set Priority Hints before the native setter submits the request.
        try {
            const proto = globalThis.HTMLImageElement?.prototype;
            const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'srcset');
            if (descriptor?.set && descriptor?.get && !descriptor.set.__tuInstantMediaWrapped) {
                const nativeSet = descriptor.set;
                const wrappedSet = function(value) {
                    if (!state.instantMediaMutating.has(this)) {
                        const candidates = parseSrcsetCandidates(value);
                        const wide = candidates.some((candidate) => candidate.kind !== 'w' || candidate.value >= 240);
                        if (wide && state.instantResponsivePriorities < apiCriticalPostBudget(0)) {
                            try {
                                this.loading = 'eager';
                                this.decoding = 'auto';
                                if ('fetchPriority' in this) this.fetchPriority = 'high';
                                state.instantResponsivePriorities += 1;
                            } catch {}
                        }
                    }
                    const result = nativeSet.call(this, value);
                    if (!state.instantMediaMutating.has(this)) primeInstantLazyImage(this, 'srcset');
                    return result;
                };
                Object.defineProperty(wrappedSet, '__tuInstantMediaWrapped', { value:true });
                Object.defineProperty(proto, 'srcset', { ...descriptor, set:wrappedSet });
            }
        } catch {}
    }

    function primeEarlyImage(image) {
        if (!settings.turboMedia || !(image instanceof HTMLImageElement) || state.shell?.contains(image)) return;
        const post = closestSourcePost(image);
        if (!post) return;
        // The document-start accelerator exists for Tumblr's deferred/LQIP pipeline. A normal live
        // srcset is already handled optimally by the browser and by prepareMediaFast; observing it
        // here would only duplicate JS work on every virtualizer insertion.
        const hasDeferred = Boolean(image.getAttribute('data-srcset') || image.getAttribute('data-lazy-srcset') || image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('data-lazy-src'));
        const apiHint = npfHintForSourceImage(image, { id:postId(post), sequence:state.earlyMediaPrimed, nativeCardWidth:earlyDeckWidthEstimate() });
        if (!hasDeferred && !apiHint) return;
        // Track author/React metadata, not currentSrc. currentSrc naturally changes as a request
        // completes and must not be mistaken for a new candidate catalogue.
        const signature = [image.getAttribute('src'), image.getAttribute('srcset'), image.getAttribute('data-srcset'), image.getAttribute('data-src'), image.getAttribute('data-original'), image.getAttribute('data-lazy-src'), image.getAttribute('data-lazy-srcset'), image.getAttribute('sizes')].join('|');
        if (state.earlyMediaSeen.get(image) === signature) return;
        state.earlyMediaSeen.set(image, signature);
        const target = earlyDeckWidthEstimate();
        const record = { sequence: state.earlyMediaPrimed, nativeCardWidth: target };
        // Do not wait for UltraDeck's card clone. Native DOM insertion itself becomes the media-start
        // signal, so a responsive resource can already be in flight while React finishes the post.
        const priority = state.earlyMediaPrimed < Math.max(16, estimatedEarlyColumns() * 2) ? 'high' : 'auto';
        applyImagePriority(image, priority);
        const resolved = apiHint || chooseDisplayImage(image, record);
        state.earlyMediaHints.set(image, resolved);
        if (resolved.chosen && !resolved.activeSrcset) warmImageUrl(resolved.chosen, priority);
        else preconnectMedia(resolved.chosen || resolved.current || resolved.url);
        state.earlyMediaPrimed += 1;
    }

    function scanEarlyMedia(node = document) {
        if (node instanceof HTMLImageElement) primeEarlyImage(node);
        if (node instanceof Element || node instanceof Document) node.querySelectorAll?.('img').forEach(primeEarlyImage);
    }

    function installEarlyMediaAccelerator() {
        if (!settings.turboMedia || state.earlyMediaObserver) return;
        if (!document.documentElement) {
            document.addEventListener('readystatechange', installEarlyMediaAccelerator, { once:true });
            return;
        }
        scanEarlyMedia(document);
        state.earlyMediaObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) if (node instanceof Element) scanEarlyMedia(node);
                } else if (mutation.target instanceof HTMLImageElement) primeEarlyImage(mutation.target);
            }
        });
        state.earlyMediaObserver.observe(document.documentElement, {
            childList:true,
            subtree:true,
            attributes:true,
            attributeFilter:['src','srcset','data-src','data-original','data-lazy-src','data-srcset','data-lazy-srcset','sizes','loading'],
        });
    }

    function applyImagePriority(image, priority) {
        const decoding = priority === 'high' ? 'auto' : 'async';
        image.loading = 'eager';
        image.decoding = decoding;
        image.setAttribute('loading', 'eager');
        image.setAttribute('decoding', decoding);
        if ('fetchPriority' in image) image.fetchPriority = priority;
        image.setAttribute('fetchpriority', priority);
    }

    function primeNativeMedia(record) {
        if (!settings.turboMedia || !record?.source?.isConnected) return;
        const priority = mediaPriority(record);
        for (const image of record.source.querySelectorAll('img')) {
            applyImagePriority(image, priority);
            const info = eagerImageSource(image);
            preconnectMedia(info.current || info.url || firstUrlFromSrcset(info.srcset));
            state.mediaNativePrimes += 1;
        }
        for (const video of record.source.querySelectorAll('video')) {
            if (!video.preload || video.preload === 'none') video.preload = 'metadata';
            preconnectMedia(video.poster || video.currentSrc || video.src);
        }
    }

    function reserveMediaGeometry(source, mirror) {
        if (!(mirror instanceof HTMLElement)) return;
        let w = 0, h = 0;
        if (source instanceof HTMLImageElement && source.naturalWidth > 0 && source.naturalHeight > 0) {
            w = source.naturalWidth; h = source.naturalHeight;
            if (!mirror.getAttribute('width')) mirror.setAttribute('width', String(w));
            if (!mirror.getAttribute('height')) mirror.setAttribute('height', String(h));
        } else if (source instanceof HTMLVideoElement && source.videoWidth > 0 && source.videoHeight > 0) {
            w = source.videoWidth; h = source.videoHeight;
        } else {
            const attrW = Number(source?.getAttribute?.('width') || 0);
            const attrH = Number(source?.getAttribute?.('height') || 0);
            if (attrW > 0 && attrH > 0) { w = attrW; h = attrH; }
            else {
                const rect = source?.getBoundingClientRect?.();
                if (rect?.width > 1 && rect?.height > 1) { w = rect.width; h = rect.height; }
            }
        }
        if (w > 0 && h > 0) mirror.style.setProperty('aspect-ratio', `${w} / ${h}`);
    }

    function enqueueDecode(image) {
        if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth <= 0 || typeof image.decode !== 'function') return;
        if (image.dataset.tuDecodeQueued === '1' || image.dataset.tuDecoded === '1') return;
        image.dataset.tuDecodeQueued = '1';
        state.decodeQueue.push(image);
        scheduleBackground(pumpDecodeQueue, 120);
    }

    function pumpDecodeQueue() {
        const max = clamp(Math.ceil((navigator.hardwareConcurrency || 8) / 3), 2, 6);
        while (state.decodeActive < max && state.decodeQueue.length) {
            const image = state.decodeQueue.shift();
            if (!(image instanceof HTMLImageElement) || !image.isConnected) continue;
            delete image.dataset.tuDecodeQueued;
            if (image.dataset.tuDecoded === '1') continue;
            state.decodeActive += 1;
            Promise.resolve().then(() => image.decode()).catch(() => {}).finally(() => {
                image.dataset.tuDecoded = '1';
                state.decodeActive -= 1;
                state.decodeCompleted += 1;
                const item = image.closest('.tu-item');
                if (item) markSpanDirty(item);
                scheduleGeometryAudit(90);
                if (state.decodeQueue.length) scheduleBackground(pumpDecodeQueue, 120);
            });
        }
    }

    function stripMirrorResponsiveSources(mirror) {
        const picture = mirror.closest('picture');
        picture?.querySelectorAll(':scope > source').forEach((candidate) => {
            candidate.removeAttribute('srcset');
            candidate.removeAttribute('sizes');
            candidate.removeAttribute('data-srcset');
            candidate.removeAttribute('data-lazy-srcset');
        });
        mirror.removeAttribute('srcset');
        mirror.removeAttribute('sizes');
        mirror.removeAttribute('data-srcset');
        mirror.removeAttribute('data-lazy-srcset');
    }

    function hasProtectedMediaGate(node) {
        if (!(node instanceof Element)) return false;
        const semanticGate = '[data-testid*="content-warning" i],[data-testid*="content_warning" i],[data-testid*="sensitive" i],[data-testid*="mature" i],[aria-label*="content warning" i],[aria-label*="sensitive content" i]';
        try {
            if (node.closest('[aria-hidden="true"]')) return true;
            const article = node.closest('article,[data-tu-mirror-post]');
            if (article?.querySelector(semanticGate)) return true;
        } catch {}
        return false;
    }

    function clearPlaceholderBlurImmediately(mirror) {
        if (!(mirror instanceof HTMLImageElement) || hasProtectedMediaGate(mirror)) return;
        // The mirror is often still detached when the HQ URL is selected, so getComputedStyle() may
        // not expose Tumblr's class-driven LQIP filter yet. Apply a narrow placeholder override to
        // the image and structural media wrappers unconditionally. This is used only after we have
        // positively selected a different display-sufficient resource.
        const targets = [mirror];
        let node = mirror.parentElement;
        for (let depth = 0; node instanceof HTMLElement && depth < 3; depth += 1, node = node.parentElement) {
            if (node.tagName === 'PICTURE' || node.tagName === 'FIGURE') targets.push(node);
            else break;
        }
        for (const target of targets) {
            target.style.setProperty('filter', 'none', 'important');
            target.style.setProperty('opacity', '1', 'important');
            target.style.setProperty('visibility', 'visible', 'important');
        }
    }

    function clearLoadedBlurEffects(mirror) {
        if (!(mirror instanceof HTMLImageElement) || hasProtectedMediaGate(mirror)) return;
        const targets = [];
        let node = mirror;
        for (let depth = 0; node instanceof HTMLElement && depth < 5; depth += 1, node = node.parentElement) {
            if (!node.closest('[data-tu-mirror-post]')) break;
            targets.push(node);
            if (node.tagName === 'FIGURE' || node.tagName === 'ARTICLE') break;
        }
        for (const target of [...new Set(targets)]) {
            try {
                const style = getComputedStyle(target);
                if (/blur\(/i.test(style.filter || '')) target.style.setProperty('filter', 'none', 'important');
                const structuralMediaWrapper = target === mirror || target.tagName === 'PICTURE' || target.tagName === 'FIGURE' || (target.children.length <= 2 && target.querySelector(':scope > img,:scope > picture'));
                if (structuralMediaWrapper && !target.closest('[aria-hidden="true"]')) {
                    const opacity = Number(style.opacity);
                    if (Number.isFinite(opacity) && opacity < .15) target.style.setProperty('opacity', '1', 'important');
                    if (style.visibility === 'hidden') target.style.setProperty('visibility', 'visible', 'important');
                }
            } catch {}
        }
    }

    function recordHasBetterMediaSignal(record) {
        if (!record?.id) return false;
        if (state.apiPostMediaHints.has(String(record.id))) return true;
        const source = record.source;
        if (!(source instanceof Element) || !source.isConnected) return false;
        // Do not spin the background media queue against a plain tiny LQIP when Tumblr has not yet
        // published a better candidate. The attribute observer and NPF payload hook are authoritative
        // wake-up signals, so waiting here removes futile rescans without delaying a real upgrade.
        return Boolean(source.querySelector('img[srcset],img[data-srcset],img[data-lazy-srcset],img[data-src],img[data-original],img[data-lazy-src],picture source[srcset],picture source[data-srcset],picture source[data-lazy-srcset]'));
    }

    function finalizeMirrorImageQuality(mirror, record) {
        if (!(mirror instanceof HTMLImageElement) || !record) return;
        const needed = Math.max(1, Number(mirror.dataset.tuTargetPhysical || 1) * .78);
        if (mirror.complete && mirror.naturalWidth >= needed) {
            if (mirror.dataset.tuEverReady !== '1') {
                mirror.dataset.tuEverReady = '1';
                state.mediaQualityReady += 1;
            }
            mirror.dataset.tuQualityState = 'ready';
            mirror.dataset.tuSelectedWidth = String(Math.max(Number(mirror.dataset.tuSelectedWidth || 0), mirror.naturalWidth || 0));
            clearLoadedBlurEffects(mirror);
            return;
        }
        mirror.dataset.tuQualityState = 'weak';
        state.mediaQualityMisses += 1;
        const attempts = Number(mirror.dataset.tuUpgradeAttempts || 0);
        if (attempts < 2 && record.source?.isConnected && recordHasBetterMediaSignal(record)) {
            mirror.dataset.tuUpgradeAttempts = String(attempts + 1);
            state.mediaQualityUpgrades += 1;
            // Re-read only when a better candidate signal actually exists. Otherwise the source/API
            // mutation hooks will wake this record when Tumblr publishes the HQ media catalogue.
            queueMediaSync(record);
        }
    }

    function primeMirrorImage(source, mirror, record, resolvedHint = null) {
        if (!(source instanceof HTMLImageElement) || !(mirror instanceof HTMLImageElement)) return;
        if (!settings.turboMedia) return;
        const resolved = resolvedHint || chooseDisplayImage(source, record);
        const priority = mediaPriority(record);
        applyImagePriority(mirror, priority);
        reserveMediaGeometry(source, mirror);

        if (mirror.dataset.tuLoadHooked !== '1') {
            mirror.dataset.tuLoadHooked = '1';
            state.mediaLoadHooks += 1;
            mirror.addEventListener('load', () => {
                delete mirror.dataset.tuDecoded;
                enqueueDecode(mirror);
                finalizeMirrorImageQuality(mirror, record);
                const item = mirror.closest('.tu-item');
                if (item) markSpanDirty(item);
            });
            mirror.addEventListener('error', () => {
                mirror.dataset.tuQualityState = 'error';
                const attempts = Number(mirror.dataset.tuUpgradeAttempts || 0);
                if (attempts < 2 && record.source?.isConnected) {
                    mirror.dataset.tuUpgradeAttempts = String(attempts + 1);
                    queueMediaSync(record);
                }
            });
        }

        let chosen = resolved.chosen;
        // Never downgrade a mirror that already has an in-flight or completed resource large enough
        // for the new (usually narrower) card. Column changes must not trigger a second rendition.
        const previousUrl = mediaUrl(mirror.dataset.tuSelectedUrl || mirror.currentSrc || mirror.src);
        const previousWidth = Math.max(Number(mirror.dataset.tuSelectedWidth || 0), mirror.complete ? (mirror.naturalWidth || 0) : 0);
        if (previousUrl && previousWidth >= resolved.targetPhysical * .82) {
            chosen = previousUrl;
            resolved.expectedWidth = previousWidth;
            resolved.rejectedPlaceholder = false;
        }
        const key = [chosen, Math.round(resolved.targetCss), Math.round(resolved.targetPhysical), priority, source.naturalWidth, source.naturalHeight, resolved.srcset].join('|');
        if (mirror.dataset.tuMediaKey === key) {
            state.mediaSkips += 1;
            if (mirror.complete && mirror.naturalWidth > 0) finalizeMirrorImageQuality(mirror, record);
            enqueueDecode(mirror);
            return;
        }
        mirror.dataset.tuMediaKey = key;
        mirror.dataset.tuTargetPhysical = String(Math.max(1, Math.round(resolved.targetPhysical)));
        mirror.dataset.tuQualityState = 'loading';
        delete mirror.dataset.tuDecoded;

        if (resolved.rejectedPlaceholder) {
            if (mirror.dataset.tuPlaceholderRejected !== '1') {
                mirror.dataset.tuPlaceholderRejected = '1';
                state.mediaPlaceholderRejects += 1;
            }
            // Tumblr often leaves the tiny LQIP under a CSS blur/low-opacity treatment until its
            // own lazy loader declares the image ready. UltraDeck owns this mirror's replacement
            // request, so remove only non-semantic placeholder blur immediately rather than making
            // the user stare at a blurred wall while the HQ bytes finish. Content-warning/sensitive
            // gates are still protected by hasProtectedMediaGate().
            clearPlaceholderBlurImmediately(mirror);
        }

        // Force the exact display-sufficient resource. This avoids both Tumblr's stale LQIP/currentSrc
        // and the cloned <picture> element silently re-selecting that placeholder. The request begins
        // while the clone is still detached, before the card is inserted into the deck.
        if (chosen) {
            stripMirrorResponsiveSources(mirror);
            preconnectMedia(chosen);
            mirror.dataset.tuSelectedUrl = mediaUrl(chosen);
            if (resolved.expectedWidth > 0) mirror.dataset.tuSelectedWidth = String(Math.round(resolved.expectedWidth));
            if (mediaUrl(mirror.currentSrc || mirror.src) !== mediaUrl(chosen)) {
                mirror.src = chosen;
                state.mediaDirectStarts += 1;
            }
            handOffWarmImage(chosen);
        } else if (resolved.srcset) {
            // Last-resort responsive path when no direct candidate can be resolved.
            mirror.setAttribute('srcset', resolved.srcset);
            mirror.setAttribute('sizes', `${Math.max(1, Math.ceil(resolved.targetCss))}px`);
            if (resolved.url) mirror.setAttribute('src', resolved.url);
            preconnectMedia(resolved.url || firstUrlFromSrcset(resolved.srcset));
        }
        if (mirror.complete && mirror.naturalWidth > 0) finalizeMirrorImageQuality(mirror, record);
        enqueueDecode(mirror);
    }

    function syncCanvas(source, mirror) {
        if (!(source instanceof HTMLCanvasElement) || !(mirror instanceof HTMLCanvasElement)) return;
        try {
            if (mirror.width !== source.width) mirror.width = source.width;
            if (mirror.height !== source.height) mirror.height = source.height;
            const ctx = mirror.getContext('2d');
            if (ctx && source.width && source.height) ctx.drawImage(source, 0, 0);
        } catch {}
    }

    function prepareMediaFast(record) {
        if (!(record?.source instanceof Element) || !record.clone) return;
        const srcImages = record.mediaHints?.sourceImages || [...record.source.querySelectorAll('img')];
        const dstImages = record.clone[FAST_CLONE_IMAGES] || [...record.clone.querySelectorAll('img')];
        for (let i = 0; i < Math.min(srcImages.length, dstImages.length); i += 1) {
            primeMirrorImage(srcImages[i], dstImages[i], record, record.mediaHints?.[i] || null);
        }
        const srcVideos = record.mediaHints?.sourceVideos || [...record.source.querySelectorAll('video')];
        const dstVideos = record.clone[FAST_CLONE_VIDEOS] || [...record.clone.querySelectorAll('video')];
        for (let i = 0; i < Math.min(srcVideos.length, dstVideos.length); i += 1) {
            reserveMediaGeometry(srcVideos[i], dstVideos[i]);
            dstVideos[i].preload = 'metadata';
            dstVideos[i].removeAttribute('autoplay');
        }
        // The fast indexes exist only to fuse the initial traversals. Drop them immediately so the
        // retained card has no duplicate media index or additional long-lived references.
        try { delete record.clone[FAST_CLONE_IMAGES]; delete record.clone[FAST_CLONE_VIDEOS]; } catch {}
    }

    function rescueDetachedApiMedia(record) {
        if (!record?.clone || !record?.id) return false;
        const groups = state.apiPostMediaHints.get(String(record.id));
        if (!groups?.length) return false;
        const mirrors = [...record.clone.querySelectorAll('figure img')];
        if (!mirrors.length) return false;
        const targetCss = Math.max(1, estimatedCardWidth(record));
        const targetPhysical = Math.max(1, targetCss * displayDpr());
        const priority = mediaPriority(record);
        let touched = false;
        let started = 0;
        for (let index = 0; index < Math.min(mirrors.length, groups.length); index += 1) {
            const mirror = mirrors[index];
            const picked = selectNpfMediaCandidate(groups[index], targetPhysical);
            if (!picked?.url) continue;
            const enough = mirror.complete && mirror.naturalWidth >= targetPhysical * .78;
            if (enough) {
                clearLoadedBlurEffects(mirror);
                continue;
            }
            touched = true;
            applyImagePriority(mirror, priority === 'low' ? 'auto' : priority);
            mirror.dataset.tuTargetPhysical = String(Math.round(targetPhysical));
            mirror.dataset.tuSelectedUrl = picked.url;
            mirror.dataset.tuSelectedWidth = String(Math.round(picked.width || 0));
            mirror.dataset.tuQualityState = 'loading';
            if (picked.height > 0 && !mirror.style.aspectRatio) mirror.style.aspectRatio = `${picked.width} / ${picked.height}`;
            stripMirrorResponsiveSources(mirror);
            clearLoadedBlurEffects(mirror);
            preconnectMedia(picked.url);
            warmImageUrl(picked.url, priority === 'low' ? 'auto' : priority);
            if (mediaUrl(mirror.currentSrc || mirror.src) !== mediaUrl(picked.url)) {
                mirror.src = picked.url;
                state.mediaDirectStarts += 1;
                started += 1;
            }
            handOffWarmImage(picked.url);
            if (mirror.complete && mirror.naturalWidth > 0) finalizeMirrorImageQuality(mirror, record);
        }
        if (touched) {
            state.apiLateRescues += 1;
            state.apiLateRescueStarts += started;
        }
        return touched;
    }

    function syncMediaRecord(record) {
        if (!record?.clone) return;
        if (!record?.source?.isConnected) {
            rescueDetachedApiMedia(record);
            return;
        }
        record.mediaTargetWidth = Math.max(record.mediaTargetWidth || 0, state.cardWidth || record.nativeCardWidth || 1);
        primeNativeMedia(record);
        const sourceImages = [...record.source.querySelectorAll('img')];
        const mirrorImages = [...record.clone.querySelectorAll('img')];
        for (let i = 0; i < Math.min(sourceImages.length, mirrorImages.length); i += 1) {
            // API/NPF media frequently arrives after the card was first captured. Always prefer a
            // newly available post-media hint during resync so a 48px LQIP cannot become permanent.
            const lateHint = npfHintForSourceImage(sourceImages[i], record);
            primeMirrorImage(sourceImages[i], mirrorImages[i], record, lateHint);
        }
        const sourceVideos = [...record.source.querySelectorAll('video')];
        const mirrorVideos = [...record.clone.querySelectorAll('video')];
        for (let i = 0; i < Math.min(sourceVideos.length, mirrorVideos.length); i += 1) {
            const src = sourceVideos[i], dst = mirrorVideos[i];
            reserveMediaGeometry(src, dst);
            if (src.poster && dst.poster !== src.poster) dst.poster = src.poster;
            // Mirrors keep lightweight native media elements. Metadata avoids multiple video decoders
            // competing with images while click-through actions remain native-backed where applicable.
            if (settings.turboMedia) {
                dst.preload = 'metadata';
                dst.autoplay = false;
                dst.removeAttribute('autoplay');
                try { dst.pause(); } catch {}
            }
            preconnectMedia(src.poster || src.currentSrc || src.src);
        }
        const sourceCanvas = [...record.source.querySelectorAll('canvas')];
        const mirrorCanvas = [...record.clone.querySelectorAll('canvas')];
        for (let i = 0; i < Math.min(sourceCanvas.length, mirrorCanvas.length); i += 1) syncCanvas(sourceCanvas[i], mirrorCanvas[i]);
        record.clone.querySelectorAll('iframe').forEach((frame) => {
            // Keep embeds present and immediately available. Full interaction is provided by the
            // native-source overlay, so iframe duplication never becomes the interaction path.
            frame.setAttribute('loading', 'eager');
        });
        state.mediaSyncs += 1;
    }

    function drainMediaQueue(deadline = null) {
        const started = performance.now();
        const canContinue = () => {
            if (inputPending()) return false;
            if (deadline?.timeRemaining) return deadline.timeRemaining() > 2 || deadline.didTimeout;
            return performance.now() - started < adaptiveWorkBudget(6.2);
        };
        while (state.mediaDirty.size && canContinue()) {
            const id = state.mediaDirty.values().next().value;
            state.mediaDirty.delete(id);
            const current = state.cache.get(id);
            if (current) syncMediaRecord(current);
        }
        if (state.mediaDirty.size) {
            scheduleBackground(() => drainMediaQueue(), 120);
        } else {
            state.mediaQueueRunning = false;
            scheduleVerifyColumns();
            updateHud();
        }
    }

    function queueMediaSync(record) {
        if (!record?.id) return;
        state.mediaDirty.add(record.id);
        if (state.mediaQueueRunning) return;
        state.mediaQueueRunning = true;
        scheduleBackground(() => drainMediaQueue(), 120);
    }

    function syncAllMedia() {
        for (const record of state.cache.values()) state.mediaDirty.add(record.id);
        if (!state.mediaQueueRunning) {
            state.mediaQueueRunning = true;
            scheduleBackground(() => drainMediaQueue(), 160);
        }
    }

    function signalPostGrowth() {
        if (!state.postWaiters.size) return;
        for (const waiter of [...state.postWaiters]) {
            if (state.cache.size > waiter.before) waiter.finish(true);
        }
    }

    function addPost(post, prepared = null) {
        if (!(post instanceof HTMLElement) || (!post.isConnected && !prepared?.snapshot)) return false;
        const id = String(prepared?.id || postId(post) || '').trim();
        if (!id) return false;
        const root = document.scrollingElement || document.documentElement;
        if (state.cache.has(id)) {
            const record = state.cache.get(id);
            const sourceChanged = record.source !== post;
            if (post.isConnected) rememberMountedSource(post, id);
            else record.source = post;
            const rect = prepared?.nativeRect || post.getBoundingClientRect();
            record.nativeCardWidth = Math.max(1, rect.width || record.nativeCardWidth || 540);
            record.nativeHeight = Math.max(1, rect.height || record.nativeHeight || 320);
            const docY = root.scrollTop + rect.top;
            if (!Number.isFinite(record.nativeDocumentY) || Math.abs(docY - record.nativeDocumentY) < innerHeight * 1.5) record.nativeDocumentY = docY;
            // Do not poison the restoration anchor while Tumblr is mid-virtualization and the old
            // cell is flying far outside the viewport. Only remember a scroll position where this
            // exact post was actually on-screen.
            if (rect.bottom > 0 && rect.top < innerHeight) record.nativeScrollTop = root.scrollTop;
            post.dataset.tuNativeSource = '1';
            // A recovery/full scan commonly rediscovers the exact same React node. Attribute/load
            // observers already queue real media changes, so do not rescan every image just because
            // the post was seen again. A recycled/re-mounted native node still gets a full sync.
            if (sourceChanged) {
                record.nativeControlCache?.clear?.();
                if (record.interactionCapsule?.controls?.size) captureInteractionCapsule(record, post, record.clone);
                queueMediaSync(record);
            }
            noteNativeCaptured(id);
            return false;
        }
        const sourceTree = prepared?.snapshot || post;
        if (!prepared?.validated && !hasPostContent(sourceTree)) return false;
        const nativeRect = prepared?.nativeRect || post.getBoundingClientRect();
        // Build a lightweight record shell first and start the exact high-quality image requests
        // before cloneNode/sanitization. The request is coalesced with the mirror when it attaches.
        const recordShell = {
            id,
            source: post,
            sequence: state.sequence,
            nativeCardWidth: Math.max(1, nativeRect.width || 540),
            nativeHeight: Math.max(1, nativeRect.height || 320),
        };
        const mediaHints = prepared?.mediaHints || prewarmSourceImages(post, recordShell);
        const clone = sanitizeClone(prepared?.snapshot || post.cloneNode(true), id, true);
        const item = document.createElement('div');
        item.className = 'tu-item';
        item.dataset.tuItem = id;
        item.appendChild(clone);
        const record = {
            id,
            source: post,
            item,
            clone,
            sequence: state.sequence++,
            mediaHints,
            addedAt: Date.now(),
            nativeScrollTop: root.scrollTop,
            nativeDocumentY: root.scrollTop + nativeRect.top,
            nativeCardWidth: Math.max(1, nativeRect.width || 540),
            nativeHeight: Math.max(1, nativeRect.height || 320),
            measuredHeight: Math.max(1, nativeRect.height || 320),
            columnIndex: -1,
        };
        state.cache.set(id, record);
        state.order.push(id);
        annotateInteractionMirror(record, clone);
        restoreInteractionContext(record, clone);
        syncTextPeek(record);
        if (post.isConnected) {
            post.dataset.tuNativeSource = '1';
            rememberMountedSource(post, id);
        }
        state.nativeCapturedIds.add(id);
        // Mark detached transaction membership before any media work so priority selection never
        // forces scroll geometry for a card that has not been committed to the deck yet.
        record.pendingPlacement = Boolean(prepared?.deferPlacement);

        // Fast path: place the card immediately so feed growth is visible to the buffer controller.
        // Only geometry + already-selected native image URLs are copied synchronously. The expensive
        // responsive/media reconciliation is queued off the interaction path.
        prepareMediaFast(record);
        // Hints are only for the synchronous first paint. Later React mutations always re-read live
        // source metadata so stale candidates can never pin a card to the wrong rendition.
        record.mediaHints = null;
        if (prepared?.deferPlacement) {
            // Batch callers keep every card fully built and media-primed, but defer only the DOM
            // insertion until the current capture/build transaction finishes. This is not culling or
            // lazy rendering: every card is committed in the same JavaScript turn/batch.
        } else {
            placeRecord(record);
            activatePlacedRecord(record);
            signalPostGrowth();
        }
        return true;
    }

    function activatePlacedRecord(record) {
        if (!record?.item) return;
        record.pendingPlacement = false;
        state.resizeObserver?.observe(record.item);
        state.mediaPriorityObserver?.observe(record.item);
        record.mediaTargetWidth = Math.max(1, state.cardWidth || record.nativeCardWidth || 1);
        // prepareMediaFast already selected and started the final image resources synchronously.
        // Avoid an immediate second full image walk. Mutation/load/error observers request a sync
        // only if Tumblr actually publishes new media state or a quality check detects a miss.
        state.lastNewPostAt = Date.now();
    }

    function commitPlacementBatch(records) {
        if (!state.grid || !records?.length) return 0;
        const pending = records.filter((record) => record?.pendingPlacement && record.item);
        if (!pending.length) return 0;
        const count = Math.max(1, state.actualColumns || 1);
        const gap = columnGap();

        if (settings.layoutMode === 'rows') {
            if (state.layoutMode !== 'rows') {
                // A structural mismatch is rare; one full detached rebuild includes all pending cards.
                rebuildAlignedRows(true);
            } else {
                const fragment = document.createDocumentFragment();
                for (const record of pending) {
                    fragment.appendChild(record.item);
                    record.columnIndex = Math.max(0, (record.sequence || 0) % count);
                    record.measuredHeight = estimateHeight(record);
                    state.columnPlacements += 1;
                }
                state.grid.appendChild(fragment);
            }
        } else {
            const validColumns = state.layoutMode === 'masonry' && state.columnEls.length === count && state.columnEls[0]?.isConnected;
            if (!validColumns) {
                // Keep the same shortest-column algorithm and complete card set, but assemble it once
                // off-DOM instead of forcing one live insertion per newly captured card.
                rebuildMasonryColumns(true);
            } else {
                const fragments = state.columnEls.map(() => document.createDocumentFragment());
                for (const record of pending) {
                    const index = shortestColumnIndex();
                    fragments[index].appendChild(record.item);
                    record.columnIndex = index;
                    const h = estimateHeight(record);
                    record.measuredHeight = h;
                    state.columnLoads[index] += h + gap;
                    state.columnPlacements += 1;
                }
                // At most one live-DOM insertion per column, regardless of batch size. Every card is
                // already present in its fragment and becomes visible in this same synchronous commit.
                for (let index = 0; index < fragments.length; index += 1) {
                    if (fragments[index].childNodes.length) state.columnEls[index].appendChild(fragments[index]);
                }
            }
        }

        for (const record of pending) activatePlacedRecord(record);
        signalPostGrowth();
        scheduleVerifyColumns(30);
        return pending.length;
    }

    function scoreTimeline(timeline) {
        if (!(timeline instanceof HTMLElement) || state.shell?.contains(timeline)) return -Infinity;
        const posts = postCandidates(timeline).filter(validSourcePost);
        if (!posts.length) return -Infinity;
        const r = timeline.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const centerScore = 1 - clamp(Math.abs(center - innerWidth / 2) / Math.max(innerWidth / 2, 1), 0, 1);
        const key = timelineKey(timeline);
        return posts.length * 240 + centerScore * 90 + timelineScoreBonus(key);
    }

    function chooseTimeline() {
        const timelines = siteTimelineCandidates().filter((t) => !state.shell?.contains(t) && !t.closest(EXCLUDED_SOURCE_SELECTOR));
        // An adapter can provide one cheap evidence selector so a sole semantic timeline never pays
        // an all-post JavaScript enumeration merely to prove that it contains feed content.
        if (timelines.length === 1) {
            const evidence = String(SITE.timelineEvidenceSelector || '').trim();
            if (evidence) {
                try { if (timelines[0].querySelector(evidence)) return timelines[0]; } catch {}
            } else if (postCandidates(timelines[0]).some(validSourcePost)) return timelines[0];
        }
        let best = null, bestScore = -Infinity;
        for (const timeline of timelines) {
            const score = scoreTimeline(timeline);
            if (score > bestScore) { best = timeline; bestScore = score; }
        }
        if (best) return best;
        const posts = postCandidates(document).filter((p) => validSourcePost(p) && !state.shell?.contains(p));
        if (!posts.length) return null;
        // Fall back to the closest shared content container, without modifying it.
        let chain = [];
        let node = posts[0];
        while (node && node !== document.body) { chain.push(node); node = node.parentElement; }
        return chain.find((candidate) => posts.slice(0, Math.min(posts.length, 12)).every((p) => candidate.contains(p))) || posts[0].parentElement;
    }

    function validSourcePost(post) {
        if (!(post instanceof HTMLElement) || state.shell?.contains(post) || state.hud?.contains(post)) return false;
        try { if (EXCLUDED_SOURCE_SELECTOR && post.closest(EXCLUDED_SOURCE_SELECTOR)) return false; } catch {}
        return hasPostContent(post) && Boolean(postId(post));
    }

    function collectPostsFromNode(node, bucket) {
        if (!(node instanceof Element)) return;
        const closest = closestSourcePost(node);
        if (closest && validSourcePost(closest)) bucket.add(closest);
        for (const post of postCandidates(node)) if (validSourcePost(post)) bucket.add(post);
    }

    function resolveSourceMountWaiters(id, post) {
        const waiters = state.sourceMountWaiters.get(id);
        if (!waiters?.size) return;
        state.sourceMountWaiters.delete(id);
        for (const waiter of [...waiters]) waiter.finish(post);
    }

    function signalSourceWindowChanged() {
        state.sourceWindowGeneration += 1;
        if (!state.sourceWindowWaiters.size) return;
        for (const waiter of [...state.sourceWindowWaiters]) waiter.finish(state.sourceWindowGeneration);
    }

    function waitForSourceWindowChange(afterGeneration, timeout = 320) {
        if (state.sourceWindowGeneration !== afterGeneration) return Promise.resolve(state.sourceWindowGeneration);
        return new Promise((resolve) => {
            let settled = false;
            let timer = 0;
            const waiter = {
                finish(generation) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    state.sourceWindowWaiters.delete(waiter);
                    resolve(Number(generation) || state.sourceWindowGeneration);
                },
            };
            state.sourceWindowWaiters.add(waiter);
            timer = setTimeout(() => waiter.finish(state.sourceWindowGeneration), timeout);
        });
    }

    function rememberMountedSource(post, id = postId(post)) {
        id = String(id || '').trim();
        if (!id || !(post instanceof HTMLElement) || !post.isConnected || state.shell?.contains(post) || state.hud?.contains(post)) return null;
        // Source-window bookkeeping exists solely for off-screen native resurrection. Make the idle
        // path genuinely O(1): ordinary Tumblr post-internal mutations must not touch the retained
        // record map or source-window state until an interaction has activated the registry or an
        // exact post waiter exists. Callers that own record.source keep doing so independently.
        if (!state.interactionRegistryActive && !state.sourceMountWaiters.has(id)) return post;
        const record = state.cache.get(id);
        if (record && record.source !== post) {
            record.source = post;
            record.nativeControlCache = null;
        }
        const previous = state.mountedSources.get(id);
        state.mountedSources.set(id, post);
        if (previous !== post || !previous?.isConnected) signalSourceWindowChanged();
        resolveSourceMountWaiters(id, post);
        return post;
    }

    function activateInteractionRegistry() {
        if (state.interactionRegistryActive) return;
        state.interactionRegistryActive = true;
        try {
            const nativeRoot = state.timeline?.isConnected ? state.timeline : document;
            for (const post of postCandidates(nativeRoot)) {
                if (!(post instanceof HTMLElement) || state.shell?.contains(post) || state.hud?.contains(post)) continue;
                const id = postId(post);
                if (id) rememberMountedSource(post, id);
            }
        } catch {}
    }

    function rememberMountedSourcesFromNode(node) {
        if (!(node instanceof Element) || (!state.interactionRegistryActive && !state.sourceMountWaiters.size)) return 0;
        let count = 0;
        const remember = (post) => {
            if (!validSourcePost(post)) return;
            const id = postId(post);
            if (id && rememberMountedSource(post, id)) count += 1;
        };
        const closest = closestSourcePost(node);
        if (closest) remember(closest);
        for (const post of postCandidates(node)) remember(post);
        return count;
    }

    function forgetMountedSourcesFromNode(node) {
        if (!(node instanceof Element) || (!state.interactionRegistryActive && !state.sourceMountWaiters.size)) return 0;
        let count = 0;
        const seen = new Set();
        const forget = (post) => {
            if (!(post instanceof HTMLElement) || seen.has(post)) return;
            seen.add(post);
            const id = String(postId(post) || '').trim();
            if (!id || state.mountedSources.get(id) !== post) return;
            state.mountedSources.delete(id);
            count += 1;
        };
        // closest() checks the detached node itself, while postCandidates() covers wrapper removals
        // containing multiple native post shells. Mirrors stay retained; only dead native pointers go.
        const closest = closestSourcePost(node);
        if (closest) forget(closest);
        for (const post of postCandidates(node)) forget(post);
        if (count) signalSourceWindowChanged();
        return count;
    }

    function waitForSourceMount(id, timeout = 1100) {
        id = String(id || '').trim();
        const immediate = locateMountedSource(id);
        if (immediate) return Promise.resolve(immediate);
        state.interactionSourceWaits += 1;
        return new Promise((resolve) => {
            let settled = false;
            let timer = 0;
            const waiter = {
                finish(post) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    const group = state.sourceMountWaiters.get(id);
                    group?.delete(waiter);
                    if (group && !group.size) state.sourceMountWaiters.delete(id);
                    resolve(post instanceof HTMLElement && post.isConnected ? post : null);
                },
            };
            let group = state.sourceMountWaiters.get(id);
            if (!group) state.sourceMountWaiters.set(id, group = new Set());
            group.add(waiter);
            timer = setTimeout(() => waiter.finish(locateMountedSource(id)), timeout);
        });
    }

    function signalNativeGrowth() {
        if (!state.nativeWaiters.size) return;
        for (const waiter of [...state.nativeWaiters]) {
            if (state.nativeCapturedIds.size > waiter.before) waiter.finish(true);
        }
    }

    function noteNativeCaptured(id) {
        id = String(id || '').trim();
        if (!id || state.nativeCapturedIds.has(id)) return false;
        state.nativeCapturedIds.add(id);
        state.nativePumpSignals += 1;
        signalNativeGrowth();
        return true;
    }

    function snapshotPostForBuild(post, id, sequenceHint = state.sequence + state.postBuildQueue.length, nativeRect = null, markSource = true) {
        if (!validSourcePost(post)) return null;
        const rect = nativeRect || post.getBoundingClientRect();
        const shell = {
            id,
            source:post,
            sequence:sequenceHint,
            nativeCardWidth:Math.max(1, rect.width || 540),
            nativeHeight:Math.max(1, rect.height || 320),
        };
        // Capture the DOM before asking Tumblr's virtualizer for another batch. The expensive
        // sanitize/media/layout phases can now run later even after React recycles this source cell.
        const mediaHints = prewarmSourceImages(post, shell);
        const snapshot = post.cloneNode(true);
        if (markSource) post.dataset.tuNativeSource = '1';
        rememberMountedSource(post, id);
        state.nativeSnapshotCaptures += 1;
        noteNativeCaptured(id);
        return {
            id,
            validated:true,
            snapshot,
            mediaHints,
            nativeRect:{ width:rect.width, height:rect.height, top:rect.top, bottom:rect.bottom },
        };
    }

    function enqueuePostBuild(post) {
        if (!validSourcePost(post)) return;
        const id = postId(post);
        if (!id) return;
        // Existing posts still need their current native React node refreshed immediately.
        if (state.cache.has(id)) { noteNativeCaptured(id); addPost(post); return; }
        if (state.postBuildSet.has(id)) return;
        const prepared = snapshotPostForBuild(post, id);
        if (!prepared) return;
        state.postBuildSet.add(id);
        state.postBuildQueue.push({ id, post, prepared });
        if (!state.postBuildScheduled) {
            state.postBuildScheduled = true;
            scheduleUserVisible(drainPostBuildQueue);
        }
    }

    function drainPostBuildQueue() {
        state.postBuildScheduled = false;
        const started = performance.now();
        const recentLong = performance.now() - (state.lastLongTaskAt || -1e9) < 1200;
        const budget = adaptiveWorkBudget(8.0);
        const maxPosts = recentLong ? 8 : 24;
        let built = 0, complexity = 0;
        const placementBatch = [];
        while (state.postBuildQueue.length) {
            const task = state.postBuildQueue.shift();
            const id = task?.id || postId(task?.post);
            if (id) state.postBuildSet.delete(id);
            if (task?.post instanceof HTMLElement && task?.prepared?.snapshot) {
                const textCost = Math.min(4, (task.prepared.snapshot.textContent || '').length / 500);
                complexity += 1 + textCost;
                task.prepared.deferPlacement = true;
                if (addPost(task.post, task.prepared) && id) {
                    const record = state.cache.get(id);
                    if (record) placementBatch.push(record);
                }
            }
            built += 1;
            // Complexity-aware yielding: ordinary 8-post batches usually finish in one frame,
            // while text-heavy/complex cards yield before they can monopolize the main thread.
            if ((built >= 2 && inputPending()) || built >= maxPosts || (built >= 4 && (complexity >= 10.5 || performance.now() - started >= budget))) break;
        }
        if (placementBatch.length) commitPlacementBatch(placementBatch);
        if (built) { state.postBuildBatches += 1; updateHud(); }
        if (state.postBuildQueue.length) {
            state.postBuildScheduled = true;
            scheduleUserVisible(drainPostBuildQueue);
        }
    }

    function flushHarvestQueue() {
        state.harvestScheduled = false;
        const nodes = [...state.harvestQueue];
        state.harvestQueue.clear();
        const posts = new Set();
        for (const node of nodes) collectPostsFromNode(node, posts);
        for (const post of posts) enqueuePostBuild(post);
        if (posts.size) {
            state.incrementalHarvests += 1;
            state.lastCaptureAt = Date.now();
        }
    }

    function queueHarvest(node) {
        if (node instanceof Element) state.harvestQueue.add(node);
        if (state.harvestScheduled) return;
        state.harvestScheduled = true;
        scheduleUserVisible(flushHarvestQueue);
    }

    function captureVisiblePosts() {
        if (!state.grid) return 0;
        const currentTimeline = state.timeline?.isConnected && !state.timeline.closest?.('aside,[role="complementary"]') ? state.timeline : null;
        const nextTimeline = currentTimeline || chooseTimeline();
        if (nextTimeline) state.timeline = nextTimeline;
        const scope = state.timeline?.isConnected ? state.timeline : document;
        // Mutation harvesting marks every captured native source. Once a full scan has populated the
        // deck, a single selector can prove there is nothing new without re-reading geometry for every
        // retained post. React remounts and genuinely new posts are unmarked, so they still take the
        // exhaustive path immediately. This is scan elimination, never content admission/culling.
        if (state.cache.size && !state.postBuildQueue.length && !hasUncapturedPost(scope)) {
            state.fullScanSkips = (state.fullScanSkips || 0) + 1;
            return 0;
        }
        state.fullScans += 1;
        const captureStarted = performance.now();
        const candidates = postCandidates(scope).filter(validSourcePost);
        const candidatesDone = performance.now();
        // Phase 1 is geometry-only. Read every source rect before clone/prewarm/data-attribute work can
        // invalidate layout. Phase 2 snapshots/prewarms using those frozen measurements. Phase 3
        // commits mirror nodes. Every candidate is still handled in this same full scan.
        const sources = [];
        let sequenceHint = state.sequence;
        let firstRectMs = 0;
        for (const post of candidates) {
            const id = postId(post);
            if (!id) continue;
            const firstRectStarted = sources.length ? 0 : performance.now();
            const rect = post.getBoundingClientRect();
            if (!sources.length) firstRectMs = performance.now() - firstRectStarted;
            const existing = state.cache.has(id);
            sources.push({
                post, id,
                sequenceHint: existing ? null : sequenceHint++,
                nativeRect:{ width:rect.width, height:rect.height, top:rect.top, bottom:rect.bottom },
                existing,
            });
        }
        const geometryDone = performance.now();
        // The first post geometry pass already forces the browser to resolve the native page layout.
        // Reuse that clean layout for chrome/rail discovery before clone construction or rail writes
        // can invalidate it. This removes the old document-wide pre-capture layout stall at boot.
        const chromeRoute = location.pathname;
        const topStale = state.topAnchorRoute !== chromeRoute || performance.now() - (state.lastTopDiscoveryAt || 0) >= 120;
        const railsStale = !state.railDiscoveryComplete || state.railDiscoveryRoute !== chromeRoute;
        if (sources.length && topStale) discoverTop();
        if (sources.length && railsStale) discoverRails(true);
        const prepared = [];
        const existing = [];
        for (const source of sources) {
            if (source.existing) { existing.push(source); continue; }
            const snapshot = snapshotPostForBuild(source.post, source.id, source.sequenceHint, source.nativeRect, false);
            if (snapshot) prepared.push({ post:source.post, snapshot });
        }
        const snapshotsDone = performance.now();
        let added = 0;
        const placementBatch = [];
        for (const source of existing) addPost(source.post, { nativeRect:source.nativeRect });
        for (const task of prepared) {
            task.snapshot.deferPlacement = true;
            if (addPost(task.post, task.snapshot)) {
                added += 1;
                const record = state.cache.get(task.snapshot.id || postId(task.post));
                if (record) placementBatch.push(record);
            }
        }
        const recordsBuiltDone = performance.now();
        if (placementBatch.length) commitPlacementBatch(placementBatch);
        const commitDone = performance.now();
        state.lastCaptureTimings = {
            candidateMs:Number((candidatesDone - captureStarted).toFixed(2)),
            geometryMs:Number((geometryDone - candidatesDone).toFixed(2)),
            firstRectMs:Number(firstRectMs.toFixed(2)),
            remainingGeometryMs:Number((geometryDone - candidatesDone - firstRectMs).toFixed(2)),
            snapshotMs:Number((snapshotsDone - geometryDone).toFixed(2)),
            recordBuildMs:Number((recordsBuiltDone - snapshotsDone).toFixed(2)),
            placementMs:Number((commitDone - recordsBuiltDone).toFixed(2)),
            commitMs:Number((commitDone - snapshotsDone).toFixed(2)),
            totalMs:Number((commitDone - captureStarted).toFixed(2)),
            candidates:candidates.length,
            added,
        };
        if (candidates.length) state.lastCaptureAt = Date.now();
        if (added) {
            scheduleMasonry();
            updateHud();
        }
        return added;
    }

    function topChromeBoundary() {
        const centerX = innerWidth / 2;
        const candidates = new Set();
        const add = (el) => { if (el instanceof HTMLElement && !state.shell?.contains(el) && !state.hud?.contains(el)) candidates.add(el); };
        try {
            document.querySelectorAll('header,nav,[role="navigation"],[role="tablist"]').forEach(add);
            const siteTopSelector = String(SITE.topChromeLinkSelector || '').trim();
            if (siteTopSelector) document.querySelectorAll(siteTopSelector).forEach((link) => {
                let el = link;
                for (let i = 0; i < 5 && el?.parentElement; i += 1, el = el.parentElement) {
                    const r = el.getBoundingClientRect();
                    if (r.width >= 280 && r.height >= 28 && r.height <= 140 && r.top >= -8 && r.top < 150) add(el);
                }
            });
        } catch {}
        let bottom = clamp(Number(SITE.topBaseline) || 76, 32, 190);
        for (const el of candidates) {
            if (!rectVisible(el) || el.closest('aside,[role="complementary"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.top > 155 || r.bottom < 30 || r.bottom > 190 || r.width < 220) continue;
            if (r.right < centerX - 340 || r.left > centerX + 340) continue;
            const style = getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky' || r.top < 100) bottom = Math.max(bottom, r.bottom);
        }
        return clamp(Math.round(bottom), 64, 190);
    }

    function topUtilityBoundary(chromeBottom) {
        const maxBottom = Math.min(innerHeight * .42, chromeBottom + 240);
        const centerX = innerWidth / 2;
        let best = 0;
        const roots = new Set();
        const nodes = new Set();
        const addRoot = (el) => {
            if (!(el instanceof HTMLElement) || state.shell?.contains(el) || state.hud?.contains(el)) return;
            if (closestSourcePost(el) || el.closest('aside,[role="complementary"]')) return;
            roots.add(el);
        };
        const addNode = (el) => {
            if (!(el instanceof HTMLElement) || state.shell?.contains(el) || state.hud?.contains(el)) return;
            if (closestSourcePost(el) || el.closest('aside,[role="complementary"]')) return;
            nodes.add(el);
        };
        // Generic controls are only useful for deck-top discovery when they live in semantic chrome.
        // Avoid querying every button/input in a large feed and rejecting post controls one by one.
        try { document.querySelectorAll('header,nav,[role="navigation"],[role="tablist"],form').forEach(addRoot); } catch {}
        const topSelector = String(SITE.topChromeLinkSelector || '').trim();
        if (topSelector) {
            try {
                document.querySelectorAll(topSelector).forEach((el) => {
                    addNode(el);
                    let root = el;
                    for (let i = 0; i < 4 && root?.parentElement; i += 1) {
                        root = root.parentElement;
                        if (root instanceof HTMLElement && !closestSourcePost(root)) addRoot(root);
                    }
                });
            } catch {}
        }
        const utilitySelector = String(SITE.utilityLinkSelector || '').trim();
        if (utilitySelector) {
            try { document.querySelectorAll(utilitySelector).forEach(addNode); } catch {}
        }
        const controlSelector = 'button,[role="button"],input,select,textarea,a[href]';
        for (const root of roots) {
            addNode(root);
            try { root.querySelectorAll(controlSelector).forEach(addNode); } catch {}
        }
        for (const node of nodes) {
            const nr = node.getBoundingClientRect();
            if (nr.bottom <= chromeBottom || nr.top >= maxBottom || nr.width < 18 || nr.height < 12) continue;
            if (nr.right < centerX - 520 || nr.left > centerX + 520) continue;
            let el = node;
            for (let i = 0; i < 5 && el instanceof HTMLElement; i += 1, el = el.parentElement) {
                if (el === document.body || el === document.documentElement || el.closest?.(`${POST_SELECTOR},aside,[role="complementary"]`)) break;
                const r = el.getBoundingClientRect();
                if (r.top < chromeBottom - 6 || r.bottom > maxBottom + 24 || r.width < 220 || r.height < 34 || r.height > 230) continue;
                const text = lowText(el);
                const controls = el.querySelectorAll('button,[role="button"],input,select,textarea,a[href]').length;
                const media = el.querySelectorAll('img,picture,figure,video').length;
                const meaningful = controls >= 3 || text.length >= 18 || (media >= 2 && text.length >= 6);
                if (!meaningful) continue;
                roots.add(el);
            }
        }
        for (const el of roots) {
            if (!rectVisible(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.bottom > chromeBottom + 8) best = Math.max(best, r.bottom);
        }
        return best ? clamp(Math.round(best), chromeBottom, Math.round(maxBottom)) : 0;
    }

    function resolveDeckTop() {
        const chromeBottom = topChromeBoundary();
        const utilityBottom = topUtilityBoundary(chromeBottom);
        // Never use native post coordinates here. Tumblr's recycled/virtualized cells can sit hundreds
        // of pixels below the actual chrome while the deck is driving the native feed in the background.
        const target = clamp(Math.round(Math.max(chromeBottom, utilityBottom || 0) + 8), 72, 260);
        state.topChromeBottom = chromeBottom;
        state.topUtilityBottom = utilityBottom;
        state.topAnchorSource = utilityBottom ? 'route-controls' : 'chrome';
        state.topAnchorRoute = location.pathname;
        if (Math.abs((state.top || 0) - target) > 1) state.topAnchorReflows += 1;
        state.top = target;
        return target;
    }

    function discoverTop(_posts = null) {
        state.topDiscoveryRuns += 1;
        resolveDeckTop();
        state.lastTopDiscoveryAt = performance.now();
        updateGeometry();
    }

    function scheduleTopDiscovery(delay = 70) {
        clearTimeout(state.topTimer);
        state.topTimer = setTimeout(() => {
            state.topTimer = 0;
            discoverTop();
        }, delay);
    }

    function mutationMayAffectTop(node) {
        if (!(node instanceof Element) || state.shell?.contains(node) || state.hud?.contains(node)) return false;
        if (node.closest(`${POST_SELECTOR},aside,[role="complementary"]`)) return false;
        const structural = 'header,nav,[role="navigation"],[role="tablist"],form';
        if (node.matches?.(structural) || node.querySelector?.(structural)) return true;
        // Route utility bars are often plain divs whose visibility is toggled by class. Require a
        // small cluster of real controls so ordinary cosmetic class churn does not trigger scans.
        try { return node.querySelectorAll?.('button,[role="button"],input,select,textarea,a[href]').length >= 3; }
        catch { return false; }
    }

    function createMirror() {
        if (state.shell?.isConnected) return;
        const shell = document.createElement('section');
        shell.id = `${ID}-shell`;
        shell.setAttribute('aria-label', `${SITE_LABEL} UltraWide Deck`);
        const grid = document.createElement('div');
        grid.id = `${ID}-grid`;
        const sentinel = document.createElement('div');
        sentinel.id = `${ID}-sentinel`;
        shell.append(grid, sentinel);
        document.documentElement.appendChild(shell);
        state.shell = shell;
        state.grid = grid;
        state.bufferSentinel = sentinel;
        if ('ResizeObserver' in window) {
            state.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (!entry.target.classList?.contains('tu-item')) continue;
                    const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
                    const height = Number(box?.blockSize || entry.contentRect?.height || 0);
                    updateRecordMeasurement(entry.target, height);
                }
                scheduleGeometryAudit(120);
            });
        }
        shell.addEventListener('scroll', onDeckScroll, { passive: true });
        if ('IntersectionObserver' in window) {
            state.bufferObserver?.disconnect?.();
            state.bufferObserver = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) ensureBuffer(adaptiveBufferTarget(), 'sentinel');
            }, { root:shell, rootMargin:'1800px 0px 3200px 0px', threshold:0.01 });
            state.bufferObserver.observe(sentinel);
            state.mediaPriorityObserver?.disconnect?.();
            state.mediaPriorityObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const item = entry.target;
                    const record = state.cache.get(item?.dataset?.tuItem || '');
                    if (!record) continue;
                    // All media starts immediately. This observer only reprioritizes already-started
                    // requests so the viewport and the next couple of screens win connection slots.
                    const priority = entry.isIntersecting ? 'high' : mediaPriority(record);
                    record.clone?.querySelectorAll('img').forEach((image) => applyImagePriority(image, priority));
                }
            }, { root:shell, rootMargin:'120% 0px 180% 0px', threshold:0.001 });
        }
        grid.addEventListener('pointerover', onMirrorPointerOver, true);
        grid.addEventListener('pointerout', onMirrorPointerOut, true);
        grid.addEventListener('pointerdown', onMirrorPointerDown, true);
        grid.addEventListener('focusin', onMirrorFocusIn, true);
        grid.addEventListener('input', syncMirrorInput, true);
        grid.addEventListener('change', syncMirrorInput, true);
        grid.addEventListener('keydown', onMirrorKeyDown, true);
        grid.addEventListener('click', proxyInteractiveClick, true);
        updateGeometry();
    }

    function clearMirror() {
        deactivateLiveInteraction();
        state.prefetchAbort += 1;
        state.prefetching = false;
        // Route isolation: time-sliced work from the old SPA route must never repopulate the new
        // deck after clearMirror(). Cancel every queued build/layout/media unit before clearing.
        state.harvestQueue.clear();
        state.harvestScheduled = false;
        state.postBuildQueue.length = 0;
        state.postBuildSet.clear();
        for (const waiter of [...state.nativeWaiters]) waiter.finish(false);
        for (const waiters of state.sourceMountWaiters.values()) for (const waiter of [...waiters]) waiter.finish(null);
        for (const waiter of [...state.sourceWindowWaiters]) waiter.finish(state.sourceWindowGeneration + 1);
        state.sourceMountWaiters.clear();
        state.sourceMountFlights.clear();
        state.sourceWindowWaiters.clear();
        state.sourceWindowGeneration += 1;
        state.mountedSources.clear();
        clearTimeout(state.interactionHoverTimer); state.interactionHoverTimer = 0; state.interactionHoverKey = '';
        state.interactionRegistryActive = false;
        state.virtualizerPixelsPerSequence = 0;
        state.virtualizerPixelsPerSequenceError = 0;
        state.virtualizerWindowSize = 0;
        state.virtualizerSeekSamples = 0;
        state.virtualizerModelPredictions = 0;
        clearTimeout(state.nativeScrollLeaseTimer); state.nativeScrollLeaseTimer = 0;
        state.nativeScrollLeaseUntil = 0;
        state.deferredBufferTarget = 0;
        state.deferredBufferReason = '';
        state.activeBufferTarget = 0;
        state.nativeCapturedIds.clear();
        state.postBuildScheduled = false;
        state.mediaDirty.clear();
        state.decodeQueue.length = 0;
        state.spanDirty.clear();
        restoreActionStage();
        state.columnEls.length = 0;
        state.columnLoads.length = 0;
        state.mediaRefreshToken += 1;
        cancelAnimationFrame(state.spanRaf); state.spanRaf = 0;
        clearTimeout(state.geometryAuditTimer); state.geometryAuditTimer = 0;
        clearTimeout(state.verifyTimer); state.verifyTimer = 0;
        for (const record of state.cache.values()) {
            if (record.source?.isConnected) record.source.removeAttribute('data-tu-native-source');
            state.resizeObserver?.unobserve(record.item);
            state.mediaPriorityObserver?.unobserve(record.item);
        }
        // Abort only pre-clone warmers that never handed off to a retained mirror. Requests already
        // owned by a mirror are not in this map, so route cleanup cannot blank a visible card.
        for (const entry of state.mediaWarmers.values()) {
            if (entry.handedOff) continue;
            try { entry.image.src = ''; } catch {}
        }
        state.mediaWarmers.clear();
        for (const entry of state.mediaPreloads.values()) {
            try { entry.link.remove(); } catch {}
        }
        state.mediaPreloads.clear();
        state.earlyMediaPrimed = 0;
        state.cache.clear();
        state.order.length = 0;
        state.sequence = 0;
        state.grid?.replaceChildren();
        if (state.shell) state.shell.scrollTop = 0;
        state.renderedColumns = 0;
        state.apiPostMediaHints.clear();
        state.apiPostDomMappings = new WeakMap();
        state.apiMediaUrls.clear();
        state.apiHighPostBudgetRemaining = 0;
        state.apiHeroWavePrimed = false;
    }

    function scheduleColumnMediaRefresh(forceQualityUpgrade = false) {
        if (!settings.turboMedia || !state.cache.size) return;
        const token = ++state.mediaRefreshToken;
        const records = [...state.cache.values()];
        let index = 0;
        const targetWidth = Math.max(1, state.cardWidth || 1);
        const chunk = () => {
            if (token !== state.mediaRefreshToken) return;
            const started = performance.now();
            while (index < records.length && performance.now() - started < 4.25) {
                const record = records[index++];
                record.clone?.querySelectorAll('img').forEach((img) => {
                    if ('fetchPriority' in img) img.fetchPriority = mediaPriority(record);
                });
                // Narrower cards should never trigger a second rendition. Only revisit media when
                // the deck became materially wider, or when a card has never been synchronized.
                if (forceQualityUpgrade || !record.mediaTargetWidth || targetWidth > record.mediaTargetWidth * 1.12) {
                    state.mediaDirty.add(record.id);
                }
            }
            if (index < records.length) scheduleBackground(chunk, 90);
            else {
                state.mediaRefreshRuns += 1;
                if (!state.mediaQueueRunning && state.mediaDirty.size) {
                    state.mediaQueueRunning = true;
                    scheduleBackground(() => drainMediaQueue(), 90);
                }
            }
        };
        scheduleBackground(chunk, 90);
    }

    function columnGap() { return Math.max(0, Number(settings.gap) || 0); }

    function measuredHeight(record) {
        if (!record) return 1;
        const live = record.item?.isConnected ? record.item.getBoundingClientRect().height : 0;
        return Math.max(1, live || record.measuredHeight || record.nativeHeight || 240);
    }

    function estimateHeight(record) {
        if (!record) return 240;
        if (record.measuredHeight > 1) return record.measuredHeight;
        const nativeWidth = Math.max(1, record.nativeCardWidth || 540);
        const nativeHeight = Math.max(1, record.nativeHeight || 320);
        const target = Math.max(1, state.cardWidth || nativeWidth);
        const ratio = target / nativeWidth;
        return Math.max(80, nativeHeight * Math.max(.52, Math.min(1.75, ratio)));
    }

    function shortestColumnIndex() {
        let best = 0, bestLoad = Infinity;
        for (let i = 0; i < state.columnLoads.length; i += 1) {
            const load = state.columnLoads[i] || 0;
            if (load < bestLoad) { bestLoad = load; best = i; }
        }
        return best;
    }

    function rebuildAlignedRows(force = false) {
        if (!state.grid) return;
        const count = Math.max(1, state.actualColumns || 1);
        const directItems = state.grid.querySelectorAll(':scope > .tu-item').length;
        if (!force && state.layoutMode === 'rows' && directItems === state.order.length) return;
        // Detach the old layout once before redistributing cards. Moving each card directly out of
        // live columns causes repeated live-DOM invalidation; the detached tree keeps every card and
        // reference intact while the complete next layout is assembled off-DOM.
        state.grid.replaceChildren();
        const fragment = document.createDocumentFragment();
        state.columnEls = [];
        state.columnLoads = Array(count).fill(0);
        let index = 0;
        for (const id of state.order) {
            const record = state.cache.get(id);
            if (!record?.item) continue;
            record.columnIndex = index % count;
            record.measuredHeight = Math.max(1, record.measuredHeight || estimateHeight(record));
            fragment.appendChild(record.item);
            index += 1;
            state.columnPlacements += 1;
        }
        state.grid.replaceChildren(fragment);
        state.layoutMode = 'rows';
        state.columnRebuilds += 1;
        scheduleVerifyColumns(30);
        scheduleGeometryAudit(80);
    }

    function rebuildMasonryColumns(force = false) {
        if (!state.grid) return;
        const count = Math.max(1, state.actualColumns || 1);
        if (!force && state.layoutMode === 'masonry' && state.columnEls.length === count && state.columnEls.every((el) => el.isConnected)) return;
        // As with aligned rows, detach the previous masonry tree in one operation, then move all
        // retained card nodes between detached containers before committing the new columns once.
        state.grid.replaceChildren();
        const fragment = document.createDocumentFragment();
        state.columnEls = [];
        state.columnLoads = Array(count).fill(0);
        for (let i = 0; i < count; i += 1) {
            const col = document.createElement('div');
            col.className = 'tu-column';
            col.dataset.tuColumn = String(i);
            state.columnEls.push(col);
            fragment.appendChild(col);
        }
        const gap = columnGap();
        for (const id of state.order) {
            const record = state.cache.get(id);
            if (!record?.item) continue;
            const h = Math.max(1, record.measuredHeight || estimateHeight(record));
            const index = shortestColumnIndex();
            state.columnEls[index].appendChild(record.item);
            record.columnIndex = index;
            record.measuredHeight = h;
            state.columnLoads[index] += h + gap;
            state.columnPlacements += 1;
        }
        state.grid.replaceChildren(fragment);
        state.layoutMode = 'masonry';
        state.columnRebuilds += 1;
        scheduleVerifyColumns(30);
        scheduleGeometryAudit(80);
    }

    function rebuildColumns(force = false) {
        if (settings.layoutMode === 'rows') rebuildAlignedRows(force || state.layoutMode !== 'rows');
        else rebuildMasonryColumns(force || state.layoutMode !== 'masonry');
    }

    function placeRecord(record) {
        if (!record?.item || !state.grid) return;
        if (settings.layoutMode === 'rows') {
            if (state.layoutMode !== 'rows') { rebuildAlignedRows(true); return; }
            state.grid.appendChild(record.item);
            record.columnIndex = Math.max(0, (record.sequence || 0) % Math.max(1, state.actualColumns || 1));
            record.measuredHeight = estimateHeight(record);
            state.columnPlacements += 1;
            scheduleVerifyColumns(30);
            return;
        }
        if (state.layoutMode !== 'masonry') { rebuildMasonryColumns(true); return; }
        // applyColumns owns structural rebuilds. New-card placement normally lands in an already-valid
        // column set, so avoid checking every column's isConnected state for every retained post.
        const expectedColumns = Math.max(1, state.actualColumns || 1);
        if (state.columnEls.length !== expectedColumns || !state.columnEls[0]?.isConnected) rebuildMasonryColumns(true);
        if (!state.columnEls.length) return;
        const index = shortestColumnIndex();
        state.columnEls[index].appendChild(record.item);
        record.columnIndex = index;
        const h = estimateHeight(record);
        record.measuredHeight = h;
        state.columnLoads[index] += h + columnGap();
        state.columnPlacements += 1;
    }

    function updateRecordMeasurement(item, observedHeight = 0) {
        if (!(item instanceof HTMLElement) || !item.isConnected) return;
        const record = state.cache.get(item.dataset.tuItem || '');
        if (!record) return;
        const h = Math.max(1, Number(observedHeight) || item.getBoundingClientRect().height || item.scrollHeight || 1);
        const old = Math.max(0, record.measuredHeight || 0);
        record.measuredHeight = h;
        if (state.layoutMode === 'masonry') {
            const index = Number(record.columnIndex);
            if (Number.isInteger(index) && index >= 0 && index < state.columnLoads.length) {
                state.columnLoads[index] = Math.max(0, (state.columnLoads[index] || 0) + h - old);
            }
        }
    }

    function markSpanDirty(item, measuredHeight = 0) { updateRecordMeasurement(item, measuredHeight); }

    function scheduleGeometryAudit(delay = 180) {
        clearTimeout(state.geometryAuditTimer);
        const generation = ++state.geometryAuditGeneration;
        state.geometryAuditTimer = setTimeout(() => auditGeometry(generation), delay);
    }

    function auditGeometry(generation = ++state.geometryAuditGeneration) {
        state.geometryAuditTimer = 0;
        if (!state.grid?.isConnected || generation !== state.geometryAuditGeneration) return;
        state.geometryAudits += 1;
        const tolerance = 1.5;
        const buckets = Array.from({ length:Math.max(1, state.actualColumns || 1) }, () => []);
        const ids = state.order.slice();
        let collectIndex = 0, bucketIndex = 0, itemIndex = 0, previous = null, violations = 0, cards = 0;
        const yieldWork = (fn) => { state.geometryAuditYields += 1; scheduleBackground(fn, 90); };
        const overBudget = (started) => inputPending() || performance.now() - started >= adaptiveWorkBudget(4.5);
        const finish = () => {
            if (generation !== state.geometryAuditGeneration) return;
            state.geometryAuditCards += cards;
            state.geometryViolations += violations;
            if (violations) state.overlapRepairs += violations;
            updateHud();
        };
        const measure = () => {
            if (generation !== state.geometryAuditGeneration || !state.grid?.isConnected) return;
            const started = performance.now();
            while (bucketIndex < buckets.length) {
                const items = buckets[bucketIndex];
                while (itemIndex < items.length) {
                    const item = items[itemIndex++];
                    const rect = item.getBoundingClientRect();
                    cards += 1;
                    if (previous && previous.bottom > rect.top - tolerance) violations += 1;
                    previous = rect;
                    const clone = item.querySelector(':scope > [data-tu-mirror-post]');
                    const cr = clone?.getBoundingClientRect?.();
                    if (cr && (cr.left < rect.left - 2 || cr.right > rect.right + 2)) violations += 1;
                    if (overBudget(started)) { yieldWork(measure); return; }
                }
                bucketIndex += 1; itemIndex = 0; previous = null;
            }
            finish();
        };
        const collect = () => {
            if (generation !== state.geometryAuditGeneration || !state.grid?.isConnected) return;
            const started = performance.now();
            while (collectIndex < ids.length) {
                const record = state.cache.get(ids[collectIndex++]);
                if (record?.item?.isConnected) {
                    const index = clamp(Number(record.columnIndex) || 0, 0, buckets.length - 1);
                    buckets[index].push(record.item);
                }
                if (overBudget(started)) { yieldWork(collect); return; }
            }
            measure();
        };
        collect();
    }

    function applyColumns(widthOverride = null) {
        if (!state.shell || !state.grid) return;
        const requestedWidth = Number(widthOverride);
        const width = Number.isFinite(requestedWidth) && requestedWidth > 0
            ? Math.max(1, requestedWidth)
            : Math.max(1, state.layoutWidth || (innerWidth - (settings.gutter * 2) - 4));
        state.layoutWidth = width;
        const previous = state.actualColumns || 1;
        const previousCardWidth = state.cardWidth || 0;
        const actual = settings.columns === 'auto'
            ? clamp(Math.floor((width + settings.gap) / (settings.minCardWidth + settings.gap)), 1, settings.maxColumns)
            : clamp(Number(settings.columns) || 1, 1, settings.maxColumns);
        state.actualColumns = actual;
        state.cardWidth = Math.max(1, (width - settings.gap * Math.max(0, actual - 1)) / actual);
        state.grid.style.setProperty('--tu-cols', String(actual));
        state.shell.style.setProperty('--tu-gap', `${settings.gap}px`);
        state.shell.style.setProperty('--tu-radius', `${settings.cardRadius}px`);
        state.shell.style.setProperty('--tu-min-card-height', `${settings.minCardHeight}px`);
        state.shell.dataset.tuCompact = settings.compact ? '1' : '0';
        state.shell.dataset.tuMediaOnly = settings.mediaOnly ? '1' : '0';
        state.shell.dataset.tuLayout = settings.layoutMode;
        const structureMismatch = settings.layoutMode === 'rows'
            ? state.layoutMode !== 'rows'
            : state.layoutMode !== 'masonry' || state.columnEls.length !== actual;
        rebuildColumns(previous !== actual || structureMismatch);
        // The structural transaction itself creates exactly `actual` masonry columns or an exact
        // CSS-grid column contract. Publish that deterministic result immediately; the delayed visual
        // verifier remains as a regression audit instead of making callers wait for a layout read.
        state.renderedColumns = actual;
        scheduleColumnMediaRefresh(previousCardWidth > 0 && state.cardWidth > previousCardWidth * 1.10);
        scheduleVerifyColumns(40);
    }

    function scheduleMasonry() {
        // v5 uses ordinary block flow inside each column. There are no row spans to repair.
        scheduleVerifyColumns(40);
        scheduleGeometryAudit(100);
    }

    function scheduleVerifyColumns(delay = 70) {
        clearTimeout(state.verifyTimer);
        state.verifyTimer = setTimeout(verifyColumns, delay);
    }

    function verifyColumns() {
        let buckets = new Set();
        if (state.layoutMode === 'rows') {
            const items = [...state.grid?.querySelectorAll(':scope > .tu-item') || []];
            for (const item of items.slice(0, Math.max(40, state.actualColumns * 3))) {
                buckets.add(Math.round(item.getBoundingClientRect().left / 4) * 4);
            }
        } else {
            const columns = state.columnEls.filter((col) => col?.isConnected && col.querySelector(':scope > .tu-item'));
            buckets = new Set(columns.map((col) => Math.round(col.getBoundingClientRect().left / 4) * 4));
        }
        state.renderedColumns = buckets.size || 0;
        updateHud();
    }

    function updateDiagnostics(full = false) {
        const shell = state.shell;
        const root = document.scrollingElement || document.documentElement;
        const previous = state.diagnostics || {};
        if (full) refreshDeckMetrics();
        const visibleItems = full ? ([...state.grid?.querySelectorAll(':scope > .tu-column > .tu-item,:scope > .tu-item') || []].length) : state.cache.size;
        const mediaQualityPending = full ? ([...state.grid?.querySelectorAll('img[data-tu-quality-state]') || []].filter((img) => img.dataset.tuQualityState !== 'ready').length) : Math.max(0, state.mediaLoadHooks - state.mediaQualityReady);
        const mediaLowQualityFinal = full ? ([...state.grid?.querySelectorAll('img[data-tu-quality-state="weak"]') || []].length) : (previous.mediaLowQualityFinal || 0);
        const hiddenTextRegions = full ? (state.grid?.querySelectorAll('[data-tu-text-only="1"]')?.length || 0) : (previous.hiddenTextRegions || 0);
        const revealedTextCards = full ? (state.grid?.querySelectorAll('.tu-item[data-tu-show-text="1"]')?.length || 0) : (previous.revealedTextCards || 0);
        const mediaPending = full ? ([...state.grid?.querySelectorAll('img') || []].filter((img) => !img.complete || img.naturalWidth <= 0).length) : Math.min(mediaQualityPending, previous.mediaPending ?? mediaQualityPending);
        state.diagnostics = {
            version: VERSION,
            site: SITE_ID,
            siteLabel: SITE_LABEL,
            route: siteRouteKey(),
            requestedColumns: state.actualColumns,
            renderedColumns: state.renderedColumns,
            cachedPosts: state.cache.size,
            visibleItems,
            deckScrollTop: Math.round(state.deckScrollTop || 0),
            deckScrollHeight: Math.round(state.deckScrollHeight || 0),
            deckClientHeight: Math.round(state.deckClientHeight || 0),
            deckScrollable: Boolean(state.deckScrollHeight > state.deckClientHeight + 1),
            nativeScrollTop: full ? Math.round(root?.scrollTop || 0) : (previous.nativeScrollTop || 0),
            nativeScrollHeight: full ? Math.round(root?.scrollHeight || 0) : (previous.nativeScrollHeight || 0),
            prefetching: state.prefetching,
            turboMedia: settings.turboMedia,
            mediaSyncs: state.mediaSyncs,
            mediaSkips: state.mediaSkips,
            mediaNativePrimes: state.mediaNativePrimes,
            mediaLoadHooks: state.mediaLoadHooks,
            mediaRefreshRuns: state.mediaRefreshRuns,
            mediaDirectStarts: state.mediaDirectStarts,
            mediaPlaceholderRejects: state.mediaPlaceholderRejects,
            mediaQualityUpgrades: state.mediaQualityUpgrades,
            mediaQualityMisses: state.mediaQualityMisses,
            mediaQualityReady: state.mediaQualityReady,
            mediaQualityPending,
            mediaLowQualityFinal,
            mediaWarmStarts: state.mediaWarmStarts,
            mediaWarmHits: state.mediaWarmHits,
            mediaWarmCompleted: state.mediaWarmCompleted,
            mediaWarmHandedOff: state.mediaWarmHandedOff,
            mediaWarmActive: [...state.mediaWarmers.values()].filter((entry) => !entry.handedOff && !entry.done).length,
            earlyMediaPrimed: state.earlyMediaPrimed,
            instantMediaPrimed: state.instantMediaPrimed,
            instantMediaWarmStarts: state.instantMediaWarmStarts,
            instantResponsivePriorities: state.instantResponsivePriorities,
            mediaWarmDecoded: state.mediaWarmDecoded,
            mediaPreloadStarts: state.mediaPreloadStarts,
            mediaPreloadHits: state.mediaPreloadHits,
            mediaPreloadCompleted: state.mediaPreloadCompleted,
            mediaPreloadErrors: state.mediaPreloadErrors,
            mediaPreloadHandedOff: state.mediaPreloadHandedOff,
            mediaPreloadActive: state.mediaPreloads.size,
            mediaPreloadPeak: state.mediaPreloadPeak,
            mediaHeroSchedules: state.mediaHeroSchedules,
            mediaHeroFirstScheduleAt: Number((state.mediaHeroFirstScheduleAt || 0).toFixed(2)),
            staticMediaPreconnects: state.staticMediaPreconnects,
            tumblrApiFetchHookInstalled: state.tumblrApiFetchHookInstalled,
            tumblrApiFetchHookAttempts: state.tumblrApiFetchHookAttempts,
            tumblrApiFetchResponses: state.tumblrApiFetchResponses,
            tumblrApiFetchMediaResponses: state.tumblrApiFetchMediaResponses,
            apiMediaScans: state.apiMediaScans,
            apiMediaBlocks: state.apiMediaBlocks,
            apiMediaStarts: state.apiMediaStarts,
            apiMediaHighStarts: state.apiMediaHighStarts,
            apiMediaHeroStarts: state.apiMediaHeroStarts,
            apiMediaSecondaryStarts: state.apiMediaSecondaryStarts,
            apiHighPostBudgetRemaining: state.apiHighPostBudgetRemaining,
            apiHeroWavePrimed: state.apiHeroWavePrimed,
            apiMediaUniqueUrls: state.apiMediaUrls.size,
            apiPostHintsStored: state.apiPostHintsStored,
            apiPostHintUses: state.apiPostHintUses,
            apiPostHintMapBuilds: state.apiPostHintMapBuilds,
            apiLateRescues: state.apiLateRescues,
            apiLateRescueStarts: state.apiLateRescueStarts,
            apiPostHintsActive: state.apiPostMediaHints.size,
            cardWidth: Math.round(state.cardWidth || 0),
            minCardHeight: settings.minCardHeight,
            mediaOnly: settings.mediaOnly,
            hiddenTextRegions,
            revealedTextCards,
            deckTop: Math.round(state.top || 0),
            topChromeBottom: Math.round(state.topChromeBottom || 0),
            topUtilityBottom: Math.round(state.topUtilityBottom || 0),
            topAnchorSource: state.topAnchorSource,
            topAnchorReflows: state.topAnchorReflows,
            topDiscoveryRuns: state.topDiscoveryRuns,
            railDiscoveryRuns: state.railDiscoveryRuns,
            geometryAudits: state.geometryAudits,
            geometryAuditYields: state.geometryAuditYields,
            geometryAuditCards: state.geometryAuditCards,
            identityMutationSkips: state.identityMutationSkips,
            geometryViolations: state.geometryViolations,
            overlapRepairs: state.overlapRepairs,
            mediaPending,
            decodeQueued: state.decodeQueue.length,
            decodeActive: state.decodeActive,
            decodeCompleted: state.decodeCompleted,
            preconnectedMediaOrigins: state.preconnected.size,
            spanWrites: state.spanWrites,
            layoutMode: state.layoutMode,
            columnRebuilds: state.columnRebuilds,
            columnPlacements: state.columnPlacements,
            nativeActions: state.nativeActions,
            nativeInputSyncs: state.nativeInputSyncs,
            actionStageActive: Boolean(state.actionStage),
            actionStageRestores: state.actionStageRestores,
            incrementalHarvests: state.incrementalHarvests,
            postBuildQueued: state.postBuildQueue.length,
            postBuildBatches: state.postBuildBatches,
            nativeCapturedPosts: state.nativeCapturedIds.size,
            nativeSnapshotCaptures: state.nativeSnapshotCaptures,
            nativePumpSignals: state.nativePumpSignals,
            fullScans: state.fullScans,
            fullScanSkips: state.fullScanSkips || 0,
            lastCaptureTimings: state.lastCaptureTimings || null,
            longTaskCount: state.longTaskCount,
            longTaskMs: Math.round(state.longTaskMs),
            scrollVelocity: Number((state.scrollVelocity || 0).toFixed(3)),
            liveInteraction: settings.liveInteraction,
            livePost: state.liveRecord?.id || '',
            interactionRestores: state.interactionRestores,
            interactionFailures: state.interactionFailures,
            pumpFailures: state.pumpFailures,
            leftOpen: !settings.focus && settings.leftOpen,
            rightOpen: !settings.focus && settings.rightOpen,
            leftDetected: Boolean(state.left.frame?.isConnected || state.left.fragments.some(connected)),
            rightDetected: Boolean(state.right.frame?.isConnected || state.right.fragments.some(connected)),
            settings: { ...settings },
        };
        if (full || state.interactionRegistryActive || state.lastInteractionResult) {
            Object.assign(state.diagnostics, {
                interactionMountRequests: state.interactionMountRequests,
                interactionMountSuccesses: state.interactionMountSuccesses,
                interactionMountMs: Number((state.interactionMountMs || 0).toFixed(2)),
                interactionMountMaxMs: Number((state.interactionMountMaxMs || 0).toFixed(2)),
                interactionFastSourceHits: state.interactionFastSourceHits,
                interactionSourceWaits: state.interactionSourceWaits,
                interactionControlPathHits: state.interactionControlPathHits,
                interactionControlSignatureHits: state.interactionControlSignatureHits,
                interactionCapsules: state.interactionCapsules,
                interactionCapsuleControls: state.interactionCapsuleControls,
                interactionCapsulePathHits: state.interactionCapsulePathHits,
                interactionContextCaptures: state.interactionContextCaptures,
                interactionContextRestores: state.interactionContextRestores,
                interactionContextStickyPreserves: state.interactionContextStickyPreserves,
                interactionContextSessionLoads: state.interactionContextSessionLoads,
                interactionContextSessionSaves: state.interactionContextSessionSaves,
                interactionDraftSyncRetries: state.interactionDraftSyncRetries,
                interactionDraftSyncRetrySuccesses: state.interactionDraftSyncRetrySuccesses,
                interactionAutoRetries: state.interactionAutoRetries,
                interactionAutoRetrySuccesses: state.interactionAutoRetrySuccesses,
                interactionHoverPrewarms: state.interactionHoverPrewarms,
                interactionProgrammaticActions: state.interactionProgrammaticActions,
                interactionSeekProbes: state.interactionSeekProbes,
                interactionSeekWindowMoves: state.interactionSeekWindowMoves,
                interactionSeekPredictions: state.interactionSeekPredictions,
                interactionSeekOvershoots: state.interactionSeekOvershoots,
                interactionAnchorCaptures: state.interactionAnchorCaptures,
                interactionAnchorAdjustments: state.interactionAnchorAdjustments,
                interactionAnchorPixels: Number((state.interactionAnchorPixels || 0).toFixed(2)),
                virtualizerPixelsPerSequence: Number((state.virtualizerPixelsPerSequence || 0).toFixed(2)),
                virtualizerPixelsPerSequenceError: Number((state.virtualizerPixelsPerSequenceError || 0).toFixed(2)),
                virtualizerWindowSize: Number((state.virtualizerWindowSize || 0).toFixed(2)),
                virtualizerSeekSamples: state.virtualizerSeekSamples,
                virtualizerModelPredictions: state.virtualizerModelPredictions,
                mountedNativeSources: [...state.mountedSources.values()].filter((post) => post?.isConnected).length,
                mountedSourceRegistrySize: state.mountedSources.size,
                nativeInteractionLeaseActive: nativeInteractionLeaseActive(),
                interactionTransactionReads: state.interactionTransactionReads,
                interactionTransactionWrites: state.interactionTransactionWrites,
                interactionTransactionQueued: state.interactionTransactionQueued,
                interactionTransactionWaitMs: Number((state.interactionTransactionWaitMs || 0).toFixed(2)),
                interactionTransactionMaxWaitMs: Number((state.interactionTransactionMaxWaitMs || 0).toFixed(2)),
                interactionTransactionMaxQueue: state.interactionTransactionMaxQueue,
                interactionIntentPrewarms: state.interactionIntentPrewarms,
                interactionIntentPrewarmHits: state.interactionIntentPrewarmHits,
                nativeInteractionWriterPending: state.nativeInteractionWriterPending,
                nativeInteractionWriterActive: state.nativeInteractionWriterActive,
            });
        }
        return state.diagnostics;
    }

    function nativeFeedScrollRoots(force = false) {
        const route = siteRouteKey();
        const cached = state.nativeScrollRoots || [];
        if (!force && state.nativeScrollRootsRoute === route && cached.every((el) => el instanceof HTMLElement && el.isConnected)) return cached;
        const roots = [], seen = new Set();
        for (const selector of [TIMELINE_SELECTOR, cssSelector('cell')].filter(Boolean)) {
            try {
                for (const el of document.querySelectorAll(selector)) {
                    if (!(el instanceof HTMLElement) || seen.has(el)) continue;
                    seen.add(el);
                    const style = getComputedStyle(el);
                    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 100) roots.push(el);
                }
            } catch {}
        }
        state.nativeScrollRoots = roots;
        state.nativeScrollRootsRoute = route;
        state.nativeScrollRootScans += 1;
        return roots;
    }

    function forceNativeBottom(refreshScrollRoots = false) {
        const root = document.scrollingElement || document.documentElement;
        const y = Math.max(0, root.scrollHeight - innerHeight + 4);
        window.scrollTo(0, y);
        root.scrollTop = y;
        // Some site virtualizers use their own scroll roots. Discover those once per stable route,
        // then reuse the live elements. A stagnant pump wave forces rediscovery, so a site that
        // swaps or creates its scroll container mid-route still converges without a correctness cap.
        for (const el of nativeFeedScrollRoots(refreshScrollRoots)) el.scrollTop = el.scrollHeight;
    }

    function waitForNewPosts(before, timeout = 2200) {
        if (state.cache.size > before) return Promise.resolve(true);
        return new Promise((resolve) => {
            let settled = false;
            let recoveryTimer = 0;
            let timeoutTimer = 0;
            const waiter = {
                before,
                finish(result) {
                    if (settled) return;
                    settled = true;
                    state.postWaiters.delete(waiter);
                    clearTimeout(recoveryTimer);
                    clearTimeout(timeoutTimer);
                    resolve(Boolean(result));
                },
            };
            state.postWaiters.add(waiter);
            // Normal operation is fully event-driven through the MutationObserver + data-id
            // recycling hooks. Run only one late recovery scan for Tumblr builds that mutate a
            // virtualizer in a way that exposes neither inserted nodes nor a data-id change.
            recoveryTimer = setTimeout(() => {
                if (state.cache.size > before) { waiter.finish(true); return; }
                captureVisiblePosts();
                if (state.cache.size > before) waiter.finish(true);
            }, Math.min(1100, Math.max(650, Math.round(timeout * .55))));
            timeoutTimer = setTimeout(() => waiter.finish(state.cache.size > before), timeout);
        });
    }

    function waitForNativeGrowth(before, timeout = 1800) {
        if (state.nativeCapturedIds.size > before) return Promise.resolve(true);
        return new Promise((resolve) => {
            let settled = false;
            let recoveryTimer = 0;
            let timeoutTimer = 0;
            const waiter = {
                before,
                finish(result) {
                    if (settled) return;
                    settled = true;
                    state.nativeWaiters.delete(waiter);
                    clearTimeout(recoveryTimer);
                    clearTimeout(timeoutTimer);
                    resolve(Boolean(result));
                },
            };
            state.nativeWaiters.add(waiter);
            recoveryTimer = setTimeout(() => {
                if (state.nativeCapturedIds.size > before) { waiter.finish(true); return; }
                // Recovery scan snapshots any visible native batch missed by a hostile virtualizer.
                const timeline = state.timeline?.isConnected ? state.timeline : chooseTimeline();
                const scope = timeline?.isConnected ? timeline : document;
                const posts = postCandidates(scope).filter(validSourcePost);
                for (const post of posts) enqueuePostBuild(post);
                if (state.nativeCapturedIds.size > before) waiter.finish(true);
            }, Math.min(800, Math.max(420, Math.round(timeout * .45))));
            timeoutTimer = setTimeout(() => waiter.finish(state.nativeCapturedIds.size > before), timeout);
        });
    }

    function bufferCard(show) {
        let card = state.shell?.querySelector(':scope > .tu-buffer-card');
        if (show && !card) {
            card = document.createElement('div');
            card.className = 'tu-buffer-card';
            card.textContent = `Loading more ${SITE_LABEL} posts…`;
            state.shell?.insertBefore(card, state.bufferSentinel || null);
        } else if (!show && card) card.remove();
    }

    function adaptiveBufferTarget(extraRows = 0) {
        const columns = Math.max(1, state.actualColumns || 1);
        const velocity = Math.abs(state.scrollVelocity || 0);
        const rowsAhead = clamp((velocity > 2.2 ? 11 : velocity > 1.1 ? 9 : 7) + extraRows, 6, 14);
        const batch = clamp(columns * rowsAhead, 24, 180);
        return state.cache.size + batch;
    }

    function nativeInteractionLeaseActive() {
        return performance.now() < (state.nativeScrollLeaseUntil || 0);
    }

    function releaseNativeInteractionLeaseWhenDue() {
        clearTimeout(state.nativeScrollLeaseTimer);
        const remaining = Math.max(0, (state.nativeScrollLeaseUntil || 0) - performance.now());
        if (remaining > 1) {
            state.nativeScrollLeaseTimer = setTimeout(releaseNativeInteractionLeaseWhenDue, Math.ceil(remaining) + 4);
            return;
        }
        state.nativeScrollLeaseTimer = 0;
        state.nativeScrollLeaseUntil = 0;
        const target = state.deferredBufferTarget;
        const reason = state.deferredBufferReason || 'interaction-resume';
        state.deferredBufferTarget = 0;
        state.deferredBufferReason = '';
        if (target > state.cache.size && settings.proactiveBuffer) queueMicrotask(() => ensureBuffer(target, reason));
    }

    function acquireNativeInteractionLease(duration = 2200) {
        const until = performance.now() + Math.max(320, Number(duration) || 0);
        state.nativeScrollLeaseUntil = Math.max(state.nativeScrollLeaseUntil || 0, until);
        // Native virtualizer scrolling is a single shared resource. A user action always preempts
        // background feed pumping so the target source cannot be immediately scrolled away again.
        state.prefetchAbort += 1;
        if (state.prefetching) {
            state.deferredBufferTarget = Math.max(state.deferredBufferTarget || 0, state.activeBufferTarget || 0);
            state.deferredBufferReason = state.deferredBufferReason || 'interaction-resume';
            state.prefetching = false;
            bufferCard(false);
        }
        releaseNativeInteractionLeaseWhenDue();
    }

    async function ensureBuffer(target, reason = 'buffer') {
        if (!settings.proactiveBuffer && reason !== 'manual' && reason !== 'scroll') return;
        target = Number.isFinite(Number(target)) ? Math.max(Math.max(1, state.actualColumns), Math.ceil(Number(target))) : state.cache.size;
        if (nativeInteractionLeaseActive()) {
            state.deferredBufferTarget = Math.max(state.deferredBufferTarget || 0, target);
            state.deferredBufferReason = reason || state.deferredBufferReason || 'buffer';
            return;
        }
        if (state.prefetching || state.cache.size >= target) return;
        state.prefetching = true;
        state.activeBufferTarget = target;
        state.pumpFailures = 0;
        // Only the first rows of each newly requested scroll wave are network-critical. Future API
        // batches remain warm at normal priority until the user approaches them.
        refreshApiHighBudget(reason === 'scroll' ? 1 : 0);
        const token = ++state.prefetchAbort;
        bufferCard(true);
        updateHud();
        let stagnant = 0;
        try {
            // Pump the site's native feed on lightweight snapshots. There is deliberately no quantity
            // or attempt ceiling: a finite target is pursued until reached, the feed proves stagnant,
            // or user interaction preempts pumping. Every recycled cell is cloned before the next wave.
            for (let attempt = 0; state.nativeCapturedIds.size < target && token === state.prefetchAbort && !nativeInteractionLeaseActive(); attempt += 1) {
                const before = state.nativeCapturedIds.size;
                if (token !== state.prefetchAbort || nativeInteractionLeaseActive()) break;
                forceNativeBottom(stagnant > 0);
                const changed = await waitForNativeGrowth(before, attempt < 3 ? 1200 : 1800);
                if (changed) { stagnant = 0; state.pumpFailures = 0; }
                else { stagnant += 1; state.pumpFailures += 1; }
                if (stagnant >= 3) break;
                if (changed && attempt % 5 === 4) await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                else if (!changed) await sleep(160);
            }
        } finally {
            if (token === state.prefetchAbort) {
                state.prefetching = false;
                state.activeBufferTarget = 0;
                bufferCard(false);
                if (!state.resizeObserver) scheduleMasonry();
                updateHud();
            }
        }
    }

    function onDeckScroll() {
        if (!state.shell || state.scrollRaf) return;
        state.scrollRaf = requestAnimationFrame(() => {
            state.scrollRaf = 0;
            if (!state.shell) return;
            const now = performance.now();
            const top = state.shell.scrollTop;
            if (state.scrollLastAt) {
                const dt = Math.max(8, now - state.scrollLastAt);
                const instant = (top - state.scrollLastTop) / dt;
                state.scrollVelocity = state.scrollVelocity * .72 + instant * .28;
            }
            state.scrollLastAt = now;
            state.scrollLastTop = top;
            refreshDeckMetrics();
            const remaining = state.deckRemaining;
            if (remaining < Math.max(1800, innerHeight * 2.2)) ensureBuffer(adaptiveBufferTarget(2), 'scroll');
            scheduleVerifyColumns(220);
        });
    }

    function updateGeometry() {
        if (!state.shell) return;
        const leftOpen = !settings.focus && settings.leftOpen && (state.left.frame || state.left.fragments.length);
        const rightOpen = !settings.focus && settings.rightOpen && (state.right.frame || state.right.fragments.length);
        const left = leftOpen ? settings.gutter + state.left.width + settings.gap : settings.gutter;
        const right = rightOpen ? settings.gutter + state.right.width + settings.gap : settings.gutter;
        const shellLeft = Math.max(settings.gutter, left);
        const shellRight = Math.max(settings.gutter, right);
        state.shell.style.setProperty('--tu-shell-left', `${shellLeft}px`);
        state.shell.style.setProperty('--tu-shell-right', `${shellRight}px`);
        state.shell.style.setProperty('--tu-shell-top', `${state.top}px`);
        // The shell is fixed to viewport left/right offsets, so its usable width can be derived without
        // a synchronous clientWidth read. Exact scrollbar-gutter width is reconciled later.
        applyColumns(Math.max(1, innerWidth - shellLeft - shellRight - 4));
        scheduleDeckMetrics(900);
    }

    function showToast(message) {
        if (!state.toast) {
            state.toast = document.createElement('div');
            Object.assign(state.toast.style, { position:'fixed',left:'50%',bottom:'78px',transform:'translateX(-50%)',zIndex:'2147483647',padding:'10px 14px',borderRadius:'12px',background:'rgba(12,15,22,.94)',border:'1px solid rgba(255,255,255,.14)',color:'#fff',font:'700 12px system-ui,sans-serif',boxShadow:'0 14px 40px rgba(0,0,0,.45)',pointerEvents:'none',opacity:'0',transition:'opacity 150ms ease' });
            document.documentElement.appendChild(state.toast);
        }
        state.toast.textContent = message;
        state.toast.style.opacity = '1';
        clearTimeout(state.toast._timer);
        state.toast._timer = setTimeout(() => state.toast.style.opacity = '0', 1900);
    }

    function syncColumnControls() {
        const sh = state.shadow;
        if (!sh) return;
        sh.querySelectorAll('[data-col]').forEach((button) => {
            const matches = button.dataset.col === 'auto'
                ? settings.columns === 'auto'
                : Number(button.dataset.col) === Number(settings.columns);
            button.classList.toggle('on', matches);
        });
    }

    function setColumns(value) {
        const next = value === 'auto' ? 'auto' : clamp(Number(value) || 1, 1, settings.maxColumns);
        if (next === settings.columns) return;
        settings.columns = next;
        saveSettings();
        applyColumns();
        // Column changes cannot alter sliders, layout mode, or feature toggles. Updating only the
        // preset state keeps the user-visible controls exact without rescanning the entire HUD.
        syncColumnControls();
    }
    function bumpColumns(delta) {
        const current = settings.columns === 'auto' ? state.actualColumns : Number(settings.columns) || 1;
        setColumns(clamp(current + delta, 1, settings.maxColumns));
    }
    function toggleLeft() {
        if (settings.focus) {
            settings.focus = false;
            settings.rightOpen = previousRailState.rightOpen;
            settings.leftOpen = !previousRailState.leftOpen;
        } else settings.leftOpen = !settings.leftOpen;
        saveSettings(); applyRail('left'); verifyRailClosed('left'); updateGeometry(); updateHud();
    }
    function toggleRight() {
        if (settings.focus) {
            settings.focus = false;
            settings.leftOpen = previousRailState.leftOpen;
            settings.rightOpen = !previousRailState.rightOpen;
        } else settings.rightOpen = !settings.rightOpen;
        saveSettings(); applyRail('right'); verifyRailClosed('right'); updateGeometry(); updateHud();
    }
    function toggleFocus() {
        if (!settings.focus) { previousRailState = { leftOpen:settings.leftOpen, rightOpen:settings.rightOpen }; settings.focus = true; }
        else { settings.focus = false; settings.leftOpen = previousRailState.leftOpen; settings.rightOpen = previousRailState.rightOpen; }
        saveSettings(); applyRail('left'); applyRail('right'); verifyRailClosed('left'); verifyRailClosed('right'); updateGeometry(); updateHud();
    }

    function elementPath(root, node) {
        const path = [];
        let current = node instanceof Element ? node : node?.parentElement;
        while (current && current !== root) {
            const parent = current.parentElement;
            if (!parent) return null;
            const children = [...parent.children];
            const index = children.indexOf(current);
            if (index < 0) return null;
            path.push(index);
            current = parent;
        }
        return current === root ? path.reverse() : null;
    }

    function nodeAtPath(root, path) {
        let current = root;
        for (const index of path || []) {
            current = current?.children?.[index];
            if (!(current instanceof Element)) return null;
        }
        return current;
    }

    function controlSignature(element) {
        return {
            testid: element?.getAttribute?.('data-testid') || '',
            aria: element?.getAttribute?.('aria-label') || '',
            title: element?.getAttribute?.('title') || '',
            role: element?.getAttribute?.('role') || '',
            href: element instanceof HTMLAnchorElement ? element.getAttribute('href') || '' : '',
            name: element?.getAttribute?.('name') || '',
            text: (element?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
            tag: element?.tagName || '',
        };
    }

    function cssAttrValue(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, ' ');
    }

    function controlDescriptor(record, mirrorNode) {
        if (!record || !(mirrorNode instanceof Element)) return null;
        if (!record.mirrorControlDescriptors) record.mirrorControlDescriptors = new WeakMap();
        const cached = record.mirrorControlDescriptors.get(mirrorNode);
        if (cached) return cached;
        const path = elementPath(record.clone, mirrorNode);
        const sig = controlSignature(mirrorNode);
        const capsuleKey = mirrorNode.getAttribute('data-tu-control-key') || '';
        const key = JSON.stringify([capsuleKey, path || [], sig.tag, sig.testid, sig.aria, sig.title, sig.href, sig.name, sig.role, sig.text]);
        const descriptor = { path, sig, key, capsuleKey };
        record.mirrorControlDescriptors.set(mirrorNode, descriptor);
        return descriptor;
    }

    function findEquivalentNode(record, mirrorNode) {
        const source = record?.source;
        if (!source?.isConnected || !(mirrorNode instanceof Element)) return null;
        const descriptor = controlDescriptor(record, mirrorNode);
        if (!descriptor) return null;
        if (!record.nativeControlCache) record.nativeControlCache = new Map();
        const cached = record.nativeControlCache.get(descriptor.key);
        if (cached instanceof Element && cached.isConnected && source.contains(cached)) return cached;

        const capsuleHit = capsuleEquivalentNode(record, descriptor, source);
        if (capsuleHit) {
            record.nativeControlCache.set(descriptor.key, capsuleHit);
            state.interactionCapsulePathHits += 1;
            return capsuleHit;
        }

        const byPath = descriptor.path ? nodeAtPath(source, descriptor.path) : null;
        if (byPath && byPath.tagName === mirrorNode.tagName) {
            record.nativeControlCache.set(descriptor.key, byPath);
            state.interactionControlPathHits += 1;
            return byPath;
        }

        const sig = descriptor.sig;
        const queryHit = (selector, predicate = null) => {
            if (!selector) return null;
            try {
                const nodes = source.querySelectorAll(selector);
                for (const el of nodes) if (!predicate || predicate(el)) return el;
            } catch {}
            return null;
        };
        const tag = sig.tag ? sig.tag.toLowerCase() : '*';
        let hit = null;
        if (sig.testid) hit = queryHit(`${tag}[data-testid="${cssAttrValue(sig.testid)}"]`);
        if (!hit && sig.aria) hit = queryHit(`${tag}[aria-label="${cssAttrValue(sig.aria)}"]`);
        if (!hit && sig.title) hit = queryHit(`${tag}[title="${cssAttrValue(sig.title)}"]`);
        if (!hit && sig.name) hit = queryHit(`${tag}[name="${cssAttrValue(sig.name)}"]`);
        if (!hit && sig.href) hit = queryHit(`a[href="${cssAttrValue(sig.href)}"]`);
        if (!hit && sig.role && sig.text) hit = queryHit(`${tag}[role="${cssAttrValue(sig.role)}"]`, (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0,100) === sig.text);
        if (!hit && sig.text) hit = queryHit(tag, (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0,100) === sig.text);
        if (hit) {
            record.nativeControlCache.set(descriptor.key, hit);
            state.interactionControlSignatureHits += 1;
        }
        return hit;
    }

    function locateMountedSource(id) {
        id = String(id || '').trim();
        if (!id) return null;
        const cached = state.mountedSources.get(id);
        if (cached instanceof HTMLElement && cached.isConnected && !state.shell?.contains(cached) && postId(cached) === id) {
            state.interactionFastSourceHits += 1;
            return cached;
        }
        if (cached) state.mountedSources.delete(id);
        const direct = siteLocateSourceById(id, document);
        if (direct instanceof HTMLElement && !state.shell?.contains(direct) && postId(direct) === id) return rememberMountedSource(direct, id);
        // Rare compatibility fallback when the adapter has no direct ID lookup or the site's
        // virtualizer temporarily exposes a non-canonical shell.
        for (const post of postCandidates(document)) {
            if (!state.shell?.contains(post) && postId(post) === id) return rememberMountedSource(post, id);
        }
        return null;
    }

    function nativeInteractionScrollCandidates(record) {
        const root = document.scrollingElement || document.documentElement;
        const max = Math.max(0, root.scrollHeight - innerHeight + 4);
        const raw = [];
        const push = (value) => {
            if (!Number.isFinite(value)) return;
            const y = clamp(Math.round(value), 0, max);
            if (!raw.some((x) => Math.abs(x - y) < 8)) raw.push(y);
        };
        // Once a route has produced real virtualizer-wave observations, reuse that learned geometry
        // as a direct seek prediction. It is only a candidate: exact mounted-source detection and the
        // feedback seeker remain authoritative, so variable-height feeds can never be made incorrect
        // by an imperfect model. Require two samples or a low-error first sample before trusting it.
        const liveWindow = mountedSequenceWindow();
        const modelScale = Number(state.virtualizerPixelsPerSequence || 0);
        const modelError = Number(state.virtualizerPixelsPerSequenceError || 0);
        const modelReliable = state.virtualizerSeekSamples >= 2 || (state.virtualizerSeekSamples >= 1 && modelScale > 0 && modelError / modelScale < .22);
        if (modelReliable && liveWindow && Number.isFinite(record?.sequence)) {
            const half = Math.max(0, (Number(state.virtualizerWindowSize || liveWindow.size || 1) - 1) / 2);
            const targetSequence = Number(record.sequence);
            const desiredMedian = targetSequence > liveWindow.max ? targetSequence + half
                : targetSequence < liveWindow.min ? targetSequence - half
                : targetSequence;
            push(root.scrollTop + (desiredMedian - liveWindow.median) * modelScale);
            state.virtualizerModelPredictions += 1;
        }
        // First calibrate against whatever Tumblr has mounted right now. Virtualizers can recycle a
        // cell one frame before their spacer/scroll geometry settles, which makes a post's absolute
        // capture coordinate one page late. The *difference* between retained capture coordinates is
        // still stable. Translate that difference from a currently mounted neighbor to recover the
        // target's live scroll anchor without viewport polling or feed-specific constants.
        const docPredictions = [], scrollPredictions = [];
        for (const [id, source] of state.mountedSources) {
            if (!(source instanceof HTMLElement) || !source.isConnected) continue;
            const anchor = state.cache.get(id);
            if (!anchor || anchor === record) continue;
            if (Number.isFinite(record?.nativeDocumentY) && Number.isFinite(anchor.nativeDocumentY)) {
                docPredictions.push(root.scrollTop + (record.nativeDocumentY - anchor.nativeDocumentY));
            }
            if (Number.isFinite(record?.nativeScrollTop) && Number.isFinite(anchor.nativeScrollTop)) {
                scrollPredictions.push(root.scrollTop + (record.nativeScrollTop - anchor.nativeScrollTop));
            }
        }
        const median = (values) => {
            if (!values.length) return NaN;
            values.sort((a,b) => a-b);
            return values[Math.floor(values.length / 2)];
        };
        push(median(docPredictions));
        push(median(scrollPredictions));
        // Absolute anchors remain valuable when the virtualizer did not race capture.
        push(record?.nativeScrollTop);
        push(Number(record?.nativeDocumentY) - Math.max(80, state.top || 120));
        // Retained order and record.sequence are append-only twins for the active route. Use the
        // O(1) sequence slot for far-post neighbor anchors, with indexOf only as a corruption/recovery
        // fallback. This keeps off-screen interaction lookup constant-time even with thousands of
        // retained cards.
        const sequenceIndex = Number(record?.sequence);
        const index = Number.isInteger(sequenceIndex) && sequenceIndex >= 0 && state.order[sequenceIndex] === record?.id
            ? sequenceIndex
            : state.order.indexOf(record?.id);
        if (index >= 0) {
            for (let radius = 1; radius <= 6; radius += 1) {
                for (const neighborId of [state.order[index - radius], state.order[index + radius]]) {
                    const neighbor = neighborId ? state.cache.get(neighborId) : null;
                    if (!neighbor) continue;
                    push(neighbor.nativeScrollTop);
                }
            }
        }
        return raw.length ? raw : [clamp(Math.round(Number(record?.nativeDocumentY) || 0), 0, max)];
    }

    function moveNativeVirtualizerTo(y) {
        const root = document.scrollingElement || document.documentElement;
        y = clamp(Math.round(Number(y) || 0), 0, Math.max(0, root.scrollHeight - innerHeight + 4));
        try { window.scrollTo({ left:0, top:y, behavior:'instant' }); }
        catch { try { window.scrollTo(0, y); } catch {} }
        if (Math.abs(root.scrollTop - y) > 1) root.scrollTop = y;
        return y;
    }

    function mountedSequenceWindow() {
        const rows = [];
        for (const [id, source] of state.mountedSources) {
            if (!(source instanceof HTMLElement) || !source.isConnected || state.shell?.contains(source)) continue;
            const record = state.cache.get(id);
            if (!record || !Number.isFinite(record.sequence)) continue;
            rows.push({ id, sequence:Number(record.sequence), record, source });
        }
        if (!rows.length) return null;
        rows.sort((a,b) => a.sequence - b.sequence);
        const middle = rows[Math.floor(rows.length / 2)];
        return {
            min:rows[0].sequence,
            max:rows[rows.length - 1].sequence,
            median:middle.sequence,
            size:rows.length,
            rows,
            signature:`${rows[0].sequence}:${rows[rows.length - 1].sequence}:${rows.map((row) => row.id).join(',')}`,
        };
    }

    function historicalPixelsPerSequence(windowInfo = null) {
        const points = [];
        const center = Number(windowInfo?.median);
        // state.order is already sequence-sorted and never culls retained records. When a mounted
        // virtualizer window gives us a center sequence, inspect only the useful +/-96 record band
        // instead of rescanning the entire retained deck. Preserve the exhaustive fallback when a
        // route has not produced a usable window yet.
        let start = 0, end = state.order.length;
        if (Number.isFinite(center) && state.order.length) {
            const centerIndex = clamp(Math.round(center), 0, state.order.length - 1);
            const centerRecord = state.cache.get(state.order[centerIndex]);
            if (centerRecord && Number(centerRecord.sequence) === centerIndex) {
                start = Math.max(0, centerIndex - 96);
                end = Math.min(state.order.length, centerIndex + 97);
            }
        }
        for (let index = start; index < end; index += 1) {
            const record = state.cache.get(state.order[index]);
            if (!record || !Number.isFinite(record.sequence) || !Number.isFinite(record.nativeScrollTop)) continue;
            if (Number.isFinite(center) && Math.abs(record.sequence - center) > 96) continue;
            points.push([Number(record.sequence), Number(record.nativeScrollTop)]);
        }
        const slopes = [];
        for (let i = 1; i < points.length; i += 1) {
            const ds = points[i][0] - points[i - 1][0];
            const dy = points[i][1] - points[i - 1][1];
            if (ds <= 0 || Math.abs(dy) < innerHeight * .3) continue;
            const slope = Math.abs(dy / ds);
            if (Number.isFinite(slope) && slope >= 20 && slope <= innerHeight * 12) slopes.push(slope);
        }
        if (!slopes.length) return NaN;
        slopes.sort((a,b) => a-b);
        return slopes[Math.floor(slopes.length / 2)];
    }

    function learnNativeVirtualizerTransition(beforeWindow, beforeY, afterWindow, afterY) {
        if (!beforeWindow || !afterWindow || beforeWindow.signature === afterWindow.signature) return NaN;
        const sequenceDelta = afterWindow.median - beforeWindow.median;
        const scrollDelta = Number(afterY) - Number(beforeY);
        if (Math.abs(sequenceDelta) < 1 || Math.abs(scrollDelta) < 8) return NaN;
        const sample = Math.abs(scrollDelta / sequenceDelta);
        if (!Number.isFinite(sample) || sample < 20 || sample > innerHeight * 16) return NaN;
        const previous = Number(state.virtualizerPixelsPerSequence || 0);
        const error = previous > 0 ? Math.abs(sample - previous) : 0;
        state.virtualizerPixelsPerSequence = previous > 0 ? previous * .42 + sample * .58 : sample;
        state.virtualizerPixelsPerSequenceError = state.virtualizerSeekSamples > 0
            ? state.virtualizerPixelsPerSequenceError * .55 + error * .45
            : error;
        state.virtualizerWindowSize = state.virtualizerWindowSize > 0
            ? state.virtualizerWindowSize * .65 + afterWindow.size * .35
            : afterWindow.size;
        state.virtualizerSeekSamples += 1;
        return sample;
    }

    async function seekNativeSourceBySequence(record, deadline) {
        if (!record || !Number.isFinite(record.sequence)) return null;
        const root = document.scrollingElement || document.documentElement;
        const targetSequence = Number(record.sequence);
        let learnedPixelsPerSequence = NaN;
        let adaptiveStep = Math.max(innerHeight * 3.2, 1400);
        let previousWindow = mountedSequenceWindow();
        const historical = historicalPixelsPerSequence(previousWindow);
        if (Number.isFinite(historical)) {
            const outside = previousWindow
                ? (targetSequence < previousWindow.min ? previousWindow.min - targetSequence : targetSequence > previousWindow.max ? targetSequence - previousWindow.max : 0)
                : 0;
            const estimated = historical * Math.max(previousWindow?.size || 1, outside || 1);
            adaptiveStep = clamp(estimated, innerHeight * 2.2, innerHeight * 10);
        }

        for (let probe = 0; probe < 7 && performance.now() < deadline; probe += 1) {
            const immediate = locateMountedSource(record.id);
            if (immediate) return immediate;
            const windowInfo = mountedSequenceWindow() || previousWindow;
            let direction = 0;
            let sequenceDistance = 1;
            if (windowInfo) {
                if (targetSequence < windowInfo.min) { direction = -1; sequenceDistance = windowInfo.min - targetSequence; }
                else if (targetSequence > windowInfo.max) { direction = 1; sequenceDistance = targetSequence - windowInfo.max; }
                else {
                    // The target sequence lies inside Tumblr's mounted order window but its exact
                    // node has not committed yet. A small direction-aware wake-up is enough without
                    // disturbing the visible UltraDeck deck.
                    direction = targetSequence <= windowInfo.median ? -1 : 1;
                    sequenceDistance = 1;
                }
            } else {
                const targetY = Number(record.nativeScrollTop);
                direction = Number.isFinite(targetY) && targetY < root.scrollTop ? -1 : 1;
            }

            let distance = adaptiveStep;
            if (Number.isFinite(learnedPixelsPerSequence) && windowInfo) {
                const fromMedian = Math.max(1, Math.abs(targetSequence - windowInfo.median));
                distance = clamp(learnedPixelsPerSequence * fromMedian, innerHeight * .85, innerHeight * 12);
                state.interactionSeekPredictions += 1;
            } else if (windowInfo && sequenceDistance > Math.max(1, windowInfo.size)) {
                distance = clamp(adaptiveStep * Math.min(5, sequenceDistance / Math.max(1, windowInfo.size)), innerHeight * 2.2, innerHeight * 14);
            }

            const beforeY = root.scrollTop;
            const beforeWindow = mountedSequenceWindow() || windowInfo;
            const beforeGeneration = state.sourceWindowGeneration;
            const targetY = moveNativeVirtualizerTo(beforeY + direction * distance);
            state.interactionSeekProbes += 1;
            let source = locateMountedSource(record.id);
            if (source) return source;
            const remaining = deadline - performance.now();
            if (remaining < 60) break;
            await waitForSourceWindowChange(beforeGeneration, Math.min(360, Math.max(80, remaining)));
            source = locateMountedSource(record.id);
            if (source) return source;

            const afterWindow = mountedSequenceWindow();
            const afterY = root.scrollTop;
            if (beforeWindow && afterWindow && afterWindow.signature !== beforeWindow.signature) {
                state.interactionSeekWindowMoves += 1;
                const learned = learnNativeVirtualizerTransition(beforeWindow, beforeY, afterWindow, afterY);
                if (Number.isFinite(learned)) {
                    learnedPixelsPerSequence = Number.isFinite(learnedPixelsPerSequence)
                        ? learnedPixelsPerSequence * .35 + learned * .65
                        : learned;
                }
                const wasBefore = targetSequence > beforeWindow.max;
                const wasAfter = targetSequence < beforeWindow.min;
                const nowPastForward = wasBefore && targetSequence < afterWindow.min;
                const nowPastBackward = wasAfter && targetSequence > afterWindow.max;
                if (nowPastForward || nowPastBackward) {
                    state.interactionSeekOvershoots += 1;
                    adaptiveStep = Math.max(innerHeight * .75, Math.abs(afterY - beforeY) * .48);
                } else {
                    adaptiveStep = Math.max(innerHeight * 1.25, Math.abs(afterY - beforeY) * 1.18);
                }
                previousWindow = afterWindow;
            } else {
                // No virtualizer wave changed. Increase the probe geometrically so feeds with large
                // spacer pages converge quickly while still remaining bounded by the deadline.
                adaptiveStep = clamp(Math.max(adaptiveStep, Math.abs(targetY - beforeY)) * 1.65, innerHeight * 1.5, innerHeight * 16);
                previousWindow = afterWindow || beforeWindow || previousWindow;
            }
        }
        return locateMountedSource(record.id);
    }

    function beginNativeInteractionReader() {
        if (state.nativeInteractionWriterActive || state.nativeInteractionWriterPending > 0) return false;
        if (state.nativeInteractionReaders === 0) {
            state.nativeInteractionReadersDrain = new Promise((resolve) => { state.nativeInteractionReadersDrainResolve = resolve; });
        }
        state.nativeInteractionReaders += 1;
        state.interactionTransactionReads += 1;
        return true;
    }

    function endNativeInteractionReader() {
        if (state.nativeInteractionReaders <= 0) return;
        state.nativeInteractionReaders -= 1;
        if (state.nativeInteractionReaders === 0) {
            const resolve = state.nativeInteractionReadersDrainResolve;
            state.nativeInteractionReadersDrain = null;
            state.nativeInteractionReadersDrainResolve = null;
            resolve?.();
        }
    }

    async function runNativeInteractionTransaction(record, task) {
        if (!record || typeof task !== 'function') return { ok:false, reason:'missing-transaction' };
        const mounted = locateMountedSource(record.id);
        if (mounted && beginNativeInteractionReader()) {
            record.source = mounted;
            try { return await task(); }
            finally { endNativeInteractionReader(); }
        }

        const queuedAt = performance.now();
        state.nativeInteractionWriterPending += 1;
        state.interactionTransactionQueued += 1;
        state.interactionTransactionMaxQueue = Math.max(state.interactionTransactionMaxQueue, state.nativeInteractionWriterPending);
        const previous = state.nativeInteractionWriterTail;
        const run = async () => {
            if (state.nativeInteractionReaders > 0 && state.nativeInteractionReadersDrain) await state.nativeInteractionReadersDrain;
            state.nativeInteractionWriterPending = Math.max(0, state.nativeInteractionWriterPending - 1);
            state.nativeInteractionWriterActive = true;
            state.interactionTransactionWrites += 1;
            const waited = performance.now() - queuedAt;
            state.interactionTransactionWaitMs += waited;
            state.interactionTransactionMaxWaitMs = Math.max(state.interactionTransactionMaxWaitMs, waited);
            try { return await task(); }
            finally { state.nativeInteractionWriterActive = false; }
        };
        const flight = previous.then(run, run);
        state.nativeInteractionWriterTail = flight.then(() => undefined, () => undefined);
        return flight;
    }

    async function restoreSourceForInteraction(record, timeout = 1900) {
        if (!record) return null;
        const fast = locateMountedSource(record.id);
        if (fast) { record.source = fast; return fast; }
        state.interactionMountRequests += 1;
        const started = performance.now();
        acquireNativeInteractionLease(Math.max(2600, timeout + 900));
        const candidates = nativeInteractionScrollCandidates(record);
        const deadline = started + Math.max(700, timeout);
        let source = null;

        // Exact/calibrated retained anchors are extremely fast when valid, so preserve that path.
        // Limit it to two short attempts; stale capture geometry must not consume the whole deadline
        // before the feedback-directed sequence seeker can learn Tumblr's current virtualizer wave.
        for (let i = 0; i < Math.min(2, candidates.length) && performance.now() < deadline; i += 1) {
            const remaining = deadline - performance.now();
            if (remaining < 80) break;
            const beforeGeneration = state.sourceWindowGeneration;
            moveNativeVirtualizerTo(candidates[i]);
            source = locateMountedSource(record.id);
            if (source) break;
            await waitForSourceWindowChange(beforeGeneration, Math.min(i === 0 ? 330 : 240, remaining));
            source = locateMountedSource(record.id);
            if (source) break;
        }

        if (!source && performance.now() < deadline) source = await seekNativeSourceBySequence(record, deadline);

        if (!source && performance.now() < deadline) {
            // Compatibility fallback for non-ordered or unusual virtualizers. Retained anchors are
            // still tried exhaustively, but only after the order-aware seeker has had first use of
            // the deadline. UltraDeck's visible scroll position is never touched.
            for (let i = 2; i < candidates.length && performance.now() < deadline; i += 1) {
                const remaining = deadline - performance.now();
                if (remaining < 70) break;
                const beforeGeneration = state.sourceWindowGeneration;
                moveNativeVirtualizerTo(candidates[i]);
                source = locateMountedSource(record.id);
                if (source) break;
                await waitForSourceWindowChange(beforeGeneration, Math.min(180, remaining));
                source = locateMountedSource(record.id);
                if (source) break;
            }
        }

        const elapsed = performance.now() - started;
        state.interactionMountMs += elapsed;
        state.interactionMountMaxMs = Math.max(state.interactionMountMaxMs, elapsed);
        if (source) {
            record.source = source;
            rememberMountedSource(source, record.id);
            state.interactionRestores += 1;
            state.interactionMountSuccesses += 1;
            queueMediaSync(record);
            return source;
        }
        return null;
    }

    async function ensureSourceMounted(record, timeout = 1900) {
        if (!record) return null;
        activateInteractionRegistry();
        const immediate = locateMountedSource(record.id);
        if (immediate) { record.source = immediate; return immediate; }
        const existing = state.sourceMountFlights.get(record.id);
        if (existing) return existing;
        const flight = restoreSourceForInteraction(record, timeout).finally(() => {
            if (state.sourceMountFlights.get(record.id) === flight) state.sourceMountFlights.delete(record.id);
        });
        state.sourceMountFlights.set(record.id, flight);
        return flight;
    }

    const LIVE_STYLE_PROPS = ['position','inset','top','right','bottom','left','width','max-width','min-width','height','max-height','margin','transform','translate','z-index','visibility','pointer-events','opacity','isolation','display','box-sizing'];

    function saveInline(element, props) {
        const saved = new Map();
        for (const prop of props) saved.set(prop, [element.style.getPropertyValue(prop), element.style.getPropertyPriority(prop)]);
        return saved;
    }

    function restoreInline(element, saved) {
        if (!element || !saved) return;
        for (const [prop, [value, priority]] of saved) {
            if (value) element.style.setProperty(prop, value, priority);
            else element.style.removeProperty(prop);
        }
    }

    function refreshMirrorFromSource(record) {
        if (!record?.source?.isConnected || !record.item?.isConnected) return;
        const fresh = sanitizeClone(record.source.cloneNode(true), record.id);
        const old = record.clone;
        annotateInteractionMirror(record, fresh);
        const missingSticky = old instanceof Element ? missingStickyInteractionContext(record, fresh) : 0;
        if (missingSticky > 0 && old?.isConnected) {
            // A virtualized remount can close an inline reply composer or remove another contextual
            // subtree even though the retained card still owns live user state. Keep that exact mirror
            // subtree instead of throwing the draft/expanded UI away, but merge current native button
            // state so likes, reposts, bookmarks, disabled state, and counts do not become stale.
            mergeFreshInteractiveState(record, fresh, old);
            restoreInteractionContext(record, old);
            record.nativeControlCache?.clear?.();
            captureInteractionCapsule(record, record.source, old);
            state.interactionContextStickyPreserves += 1;
        } else {
            if (old?.isConnected) old.replaceWith(fresh); else record.item.appendChild(fresh);
            record.clone = fresh;
            restoreInteractionContext(record, fresh);
            record.nativeControlCache?.clear?.();
            captureInteractionCapsule(record, record.source, fresh);
        }
        syncTextPeek(record);
        syncMediaRecord(record);
        updateRecordMeasurement(record.item);
    }

    // v5 never promotes or visually exposes an entire native Tumblr post. Keeping this
    // compatibility shim ensures older diagnostics/route-cleanup calls can only restore an
    // invisible staged control, never resurrect the overlap-prone whole-post overlay engine.
    function deactivateLiveInteraction() {
        restoreActionStage();
        state.liveRecord = null;
        state.liveSaved = null;
    }

    function scheduleLiveAlignment() {}

    const FULL_INTERACTIVE_SELECTOR = 'a[href],button,input,textarea,select,label,summary,details,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[contenteditable="true"],[data-testid]';
    const TEXT_EDIT_SELECTOR = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]),textarea,select,[contenteditable="true"]';
    const INTERACTION_CONTEXT_STORAGE_KEY = `${ID}:context:${SITE_ID}:v1`;
    const CONTEXT_STATE_ATTRS = Object.freeze(['aria-expanded','aria-selected','aria-checked','aria-pressed','data-state']);
    const ACTION_STAGE_PROPS = ['translate','visibility','opacity','pointer-events','z-index','transform'];

    function restoreActionStage() {
        clearTimeout(state.actionStageTimer);
        state.actionStageTimer = 0;
        const stage = state.actionStage;
        if (!stage) return;
        try {
            stage.actual?.removeAttribute('data-tu-action-anchor');
            restoreInline(stage.actual, stage.saved);
        } catch {}
        state.actionStage = null;
        state.actionStageRestores += 1;
    }

    function stageNativeControl(actual, mirror) {
        if (!(actual instanceof HTMLElement) || !(mirror instanceof Element)) return actual;
        restoreActionStage();
        const saved = saveInline(actual, ACTION_STAGE_PROPS);
        const ar = actual.getBoundingClientRect();
        const mr = mirror.getBoundingClientRect();
        let tx = (mr.left + mr.width / 2) - (ar.left + ar.width / 2);
        let ty = (mr.top + mr.height / 2) - (ar.top + ar.height / 2);
        actual.dataset.tuActionAnchor = '1';
        // Tumblr often nests timeline cells under translated/scaled virtualizer ancestors. A single
        // rounded screen-space correction can still miss the mirror by several pixels. Iterate a few
        // fractional corrections on explicit user action until the actual anchor converges.
        for (let pass = 0; pass < 8; pass += 1) {
            actual.style.setProperty('translate', `${tx.toFixed(3)}px ${ty.toFixed(3)}px`, 'important');
            const staged = actual.getBoundingClientRect();
            const ex = (mr.left + mr.width / 2) - (staged.left + staged.width / 2);
            const ey = (mr.top + mr.height / 2) - (staged.top + staged.height / 2);
            if (Math.abs(ex) <= .05 && Math.abs(ey) <= .05) break;
            tx += ex; ty += ey;
        }
        actual.style.setProperty('visibility', 'visible', 'important');
        actual.style.setProperty('opacity', '0', 'important');
        actual.style.setProperty('pointer-events', 'none', 'important');
        actual.style.setProperty('z-index', '2147482400', 'important');
        state.actionStage = { actual, saved };
        // Keep the invisible real control anchored long enough for Tumblr popovers/dialogs to read it.
        state.actionStageTimer = setTimeout(restoreActionStage, 1800);
        return actual;
    }

    function mirrorTargetInDeckViewport(target) {
        if (!(target instanceof Element) || !state.shell?.isConnected) return false;
        const tr = target.getBoundingClientRect();
        const sr = state.shell.getBoundingClientRect();
        return tr.bottom > sr.top && tr.top < sr.bottom && tr.right > sr.left && tr.left < sr.right;
    }

    function firstVisibleDeckItem(container, shellRect) {
        const children = container?.children;
        if (!children?.length) return null;
        // Cards in a masonry column or aligned-row deck are vertically monotonic. Binary search keeps
        // off-screen interaction anchoring O(log n) even with thousands of retained posts.
        let low = 0, high = children.length - 1, candidate = null;
        while (low <= high) {
            const mid = (low + high) >> 1;
            const item = children[mid];
            if (!(item instanceof HTMLElement)) { low = mid + 1; continue; }
            const rect = item.getBoundingClientRect();
            if (rect.bottom <= shellRect.top + .25) low = mid + 1;
            else { candidate = item; high = mid - 1; }
        }
        if (!(candidate instanceof HTMLElement)) return null;
        const rect = candidate.getBoundingClientRect();
        return rect.top < shellRect.bottom - .25 ? { item:candidate, top:rect.top } : null;
    }

    function captureDeckInteractionAnchor() {
        const shell = state.shell;
        if (!(shell instanceof HTMLElement) || !shell.isConnected) return null;
        const sr = shell.getBoundingClientRect();
        let hit = null;
        if (state.layoutMode === 'masonry' && state.columnEls.length) {
            // Match DOM-order semantics: the first column with a visible card is the stable retained
            // viewport anchor. No whole-deck query or viewport culling is involved.
            for (const column of state.columnEls) {
                if (!(column instanceof HTMLElement) || !column.isConnected) continue;
                hit = firstVisibleDeckItem(column, sr);
                if (hit) break;
            }
        } else {
            hit = firstVisibleDeckItem(state.grid, sr);
        }
        if (!hit) return { item:null, top:NaN, scrollTop:shell.scrollTop };
        state.interactionAnchorCaptures += 1;
        return { item:hit.item, id:hit.item.dataset.tuItem || '', top:hit.top, scrollTop:shell.scrollTop };
    }

    function restoreDeckInteractionAnchor(anchor) {
        const shell = state.shell;
        if (!anchor || !(shell instanceof HTMLElement) || !shell.isConnected) return;
        if (!(anchor.item instanceof HTMLElement) || !anchor.item.isConnected || !Number.isFinite(anchor.top)) {
            if (Number.isFinite(anchor.scrollTop) && Math.abs(shell.scrollTop - anchor.scrollTop) > .5) shell.scrollTop = anchor.scrollTop;
            return;
        }
        const now = anchor.item.getBoundingClientRect().top;
        const delta = now - anchor.top;
        if (Math.abs(delta) <= .25) return;
        shell.scrollTop += delta;
        state.interactionAnchorAdjustments += 1;
        state.interactionAnchorPixels += Math.abs(delta);
    }

    function interactionTimeoutFor(record, base = 3200) {
        const live = mountedSequenceWindow();
        if (!record || !Number.isFinite(record.sequence) || !live) return base;
        const distance = record.sequence < live.min ? live.min - record.sequence : record.sequence > live.max ? record.sequence - live.max : 0;
        return clamp(Math.round(base + distance * 9), base, 6800);
    }

    async function nativeEquivalent(record, mirrorTarget, { stage = 'auto', timeout = null } = {}) {
        if (!settings.liveInteraction || !record) return null;
        const shouldStage = stage === true || (stage === 'auto' && mirrorTargetInDeckViewport(mirrorTarget));
        const mountTimeout = Number.isFinite(timeout) ? timeout : interactionTimeoutFor(record);
        if (shouldStage) acquireNativeInteractionLease(Math.max(2400, mountTimeout + 600));
        const source = await ensureSourceMounted(record, mountTimeout);
        if (!source) return null;
        if (shouldStage) acquireNativeInteractionLease(Math.max(2100, Math.min(4200, mountTimeout)));
        let actual = findEquivalentNode(record, mirrorTarget);
        if (!actual) {
            // The source may have remounted with a different framework-generated wrapper shape. Rebind
            // the saved interaction capsule against the current native DOM before declaring failure.
            captureInteractionCapsule(record, source, record.clone);
            actual = findEquivalentNode(record, mirrorTarget);
        }
        if (!actual) return null;
        return shouldStage ? stageNativeControl(actual, mirrorTarget) : actual;
    }

    function mirrorRecordFromNode(node) {
        const mirror = node?.closest?.('[data-tu-mirror-post]');
        return mirror ? state.cache.get(mirror.dataset.tuMirrorPost) || null : null;
    }

    function interactionActionKind(element) {
        if (!(element instanceof Element)) return '';
        const tagged = element.getAttribute('data-tu-action-kind') || '';
        if (tagged) return tagged;
        for (const [kind, selector] of Object.entries(RETAINED_ACTION_SELECTORS)) {
            if (kind === 'input' || kind === 'permalink') continue;
            try { if (element.matches(selector)) return kind; } catch {}
        }
        return '';
    }

    function onMirrorPointerOver(event) {
        if (!settings.liveInteraction) return;
        const target = event.target instanceof Element ? event.target.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (!target || target.matches(TEXT_EDIT_SELECTOR)) return;
        const kind = interactionActionKind(target);
        if (!kind) return;
        const record = mirrorRecordFromNode(target);
        if (!record || locateMountedSource(record.id)) return;
        const key = `${record.id}:${target.getAttribute('data-tu-control-key') || kind}`;
        if (state.interactionHoverKey === key && state.interactionHoverTimer) return;
        clearTimeout(state.interactionHoverTimer);
        state.interactionHoverKey = key;
        state.interactionHoverTimer = setTimeout(() => {
            state.interactionHoverTimer = 0;
            if (state.interactionHoverKey !== key || locateMountedSource(record.id)) return;
            state.interactionHoverPrewarms += 1;
            prewarmInteractionSource(record, Math.min(4200, interactionTimeoutFor(record, 2600)))?.catch?.(() => {});
        }, 180);
    }

    function onMirrorPointerOut(event) {
        if (!state.interactionHoverTimer) return;
        const from = event.target instanceof Element ? event.target.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (!from) return;
        const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (to === from || from.contains(to)) return;
        clearTimeout(state.interactionHoverTimer);
        state.interactionHoverTimer = 0;
        state.interactionHoverKey = '';
    }

    function prewarmInteractionSource(record, timeout = 1900) {
        if (!settings.liveInteraction || !record) return null;
        ensureInteractionCapsule(record);
        const mounted = locateMountedSource(record.id);
        if (mounted) {
            record.source = mounted;
            state.interactionIntentPrewarmHits += 1;
            return Promise.resolve(mounted);
        }
        if (record.interactionIntentPrewarm) return record.interactionIntentPrewarm;
        state.interactionIntentPrewarms += 1;
        const flight = runNativeInteractionTransaction(record, () => ensureSourceMounted(record, timeout)).finally(() => {
            if (record.interactionIntentPrewarm === flight) record.interactionIntentPrewarm = null;
        });
        record.interactionIntentPrewarm = flight;
        return flight;
    }

    function onMirrorPointerDown(event) {
        if (event.button !== 0) return;
        const target = event.target instanceof Element ? event.target.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (!target || target.closest('video,audio')) return;
        const record = mirrorRecordFromNode(target);
        if (record) prewarmInteractionSource(record)?.catch?.(() => {});
    }

    function onMirrorFocusIn(event) {
        const target = event.target instanceof Element ? event.target.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (!target) return;
        const record = mirrorRecordFromNode(target);
        if (record) prewarmInteractionSource(record)?.catch?.(() => {});
    }

    async function syncMirrorInput(event) {
        const target = event.target instanceof Element ? event.target.closest(TEXT_EDIT_SELECTOR) : null;
        if (!target) return;
        const record = mirrorRecordFromNode(target);
        if (!record) return;
        rememberInteractionContext(record, target, { edited:true });
        if (!record.inputSyncGenerations) record.inputSyncGenerations = new WeakMap();
        const generation = (record.inputSyncGenerations.get(target) || 0) + 1;
        record.inputSyncGenerations.set(target, generation);
        return runNativeInteractionTransaction(record, async () => {
            if (record.inputSyncGenerations.get(target) !== generation) return;
            let actual = await nativeEquivalent(record, target, { stage:false });
            if (record.inputSyncGenerations.get(target) !== generation) return;
            if (!actual) {
                state.interactionDraftSyncRetries += 1;
                record.nativeControlCache?.clear?.();
                const source = await restoreSourceForInteraction(record, interactionTimeoutFor(record, 2600));
                if (source) captureInteractionCapsule(record, source, record.clone);
                actual = await nativeEquivalent(record, target, { stage:false, timeout:1400 });
                if (actual) state.interactionDraftSyncRetrySuccesses += 1;
            }
            if (record.inputSyncGenerations.get(target) !== generation) return;
            if (!actual) { state.interactionFailures += 1; return; }
            try {
                if ('value' in target && 'value' in actual) actual.value = target.value;
                if ('checked' in target && 'checked' in actual) actual.checked = target.checked;
                if (target instanceof HTMLSelectElement && actual instanceof HTMLSelectElement) actual.selectedIndex = target.selectedIndex;
                if (target.getAttribute('contenteditable') === 'true' && actual.getAttribute?.('contenteditable') === 'true') actual.innerHTML = target.innerHTML;
                const Ctor = event.type === 'input' && typeof InputEvent === 'function' ? InputEvent : Event;
                actual.dispatchEvent(new Ctor(event.type, { bubbles:true, composed:true }));
                state.nativeInputSyncs += 1;
            } catch { state.interactionFailures += 1; }
        });
    }

    function onMirrorKeyDown(event) {
        if (event.key === 'Escape') restoreActionStage();
    }

    async function executeMirrorActionCore(record, target, { programmatic = false, timeout = null } = {}) {
        if (!record || !(target instanceof Element)) return { ok:false, reason:'missing-target' };
        const offscreen = !mirrorTargetInDeckViewport(target);
        const deckAnchor = offscreen ? captureDeckInteractionAnchor() : null;
        const actual = await nativeEquivalent(record, target, { stage:'auto', timeout });
        if (!actual) {
            return { ok:false, reason:locateMountedSource(record.id) ? 'native-control-unavailable' : 'native-source-unavailable', id:record.id };
        }
        try {
            if (programmatic) state.interactionProgrammaticActions += 1;
            state.nativeActions += 1;
            const sig = controlSignature(target);
            if (typeof actual.click === 'function') actual.click();
            else actual.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, composed:true, view:window }));
            const stateful = Boolean(
                sig.testid && /like|expand|poll|answer|follow|bookmark|subscribe|toggle/i.test(sig.testid)
                || target.hasAttribute('aria-pressed') || target.hasAttribute('aria-checked')
                || target.hasAttribute('aria-expanded') || target.hasAttribute('aria-selected')
                || target instanceof HTMLDetailsElement || target instanceof HTMLElement && target.tagName === 'SUMMARY'
                || /checkbox|radio|switch/.test(sig.role)
            );
            if (stateful) {
                // Hold the native virtualizer transaction through the site's first optimistic commit.
                // A queued far-post action therefore cannot recycle this source between the exact
                // native click and mirror reconciliation.
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                rememberNativeInteractionContext(record, target, actual);
                const actionKind = interactionActionKind(target);
                if (actionKind === 'submit' || actionKind === 'dismiss') clearInteractionContext(record, { drafts:true });
                if (record.source?.isConnected) {
                    refreshMirrorFromSource(record);
                    restoreDeckInteractionAnchor(deckAnchor);
                }
                setTimeout(() => {
                    if (actual?.isConnected) rememberNativeInteractionContext(record, target, actual);
                    if (record.source?.isConnected) refreshMirrorFromSource(record);
                    restoreDeckInteractionAnchor(deckAnchor);
                }, 120);
            } else if (!sig.href && !/caret|menu|more|options/i.test(`${sig.testid} ${sig.aria} ${sig.title}`)) {
                setTimeout(() => {
                    if (actual?.isConnected) rememberNativeInteractionContext(record, target, actual);
                    const actionKind = interactionActionKind(target);
                    if (actionKind === 'submit' || actionKind === 'dismiss') clearInteractionContext(record, { drafts:true });
                    if (record.source?.isConnected) refreshMirrorFromSource(record);
                    restoreDeckInteractionAnchor(deckAnchor);
                }, 80);
            } else {
                setTimeout(() => {
                    if (actual?.isConnected) rememberNativeInteractionContext(record, target, actual);
                    if (record.source?.isConnected) refreshMirrorFromSource(record);
                    restoreDeckInteractionAnchor(deckAnchor);
                }, 80);
            }
            return { ok:true, id:record.id, action:sig };
        } catch {
            state.interactionFailures += 1;
            restoreActionStage();
            return { ok:false, reason:'native-action-threw', id:record.id };
        }
    }

    async function executeMirrorAction(record, target, options = {}) {
        if (!record || !(target instanceof Element)) return { ok:false, reason:'missing-target' };
        ensureInteractionCapsule(record);
        return runNativeInteractionTransaction(record, async () => {
            const firstTimeout = interactionTimeoutFor(record, 3200);
            let result = await executeMirrorActionCore(record, target, { ...options, timeout:firstTimeout });
            if (result.ok) return result;
            if (!['native-source-unavailable','native-control-unavailable'].includes(result.reason)) return result;
            // One physical click is one user intent. If a far virtualized source was not available on
            // the first bounded seek, continue the hidden native restore automatically and replay the
            // exact saved capsule control. Never ask the user to scroll back or click a second time.
            state.interactionAutoRetries += 1;
            record.nativeControlCache?.clear?.();
            const source = await restoreSourceForInteraction(record, Math.min(7600, Math.max(3600, firstTimeout + 1800)));
            if (source) captureInteractionCapsule(record, source, record.clone);
            result = await executeMirrorActionCore(record, target, { ...options, timeout:1800 });
            if (result.ok) {
                state.interactionAutoRetrySuccesses += 1;
                return result;
            }
            if (['native-source-unavailable','native-control-unavailable'].includes(result.reason)) state.interactionFailures += 1;
            return result;
        });
    }

    const RETAINED_ACTION_SELECTORS = Object.freeze({
        like:'[data-testid="like"],[aria-label*="like" i]',
        menu:'[data-testid="caret"],[aria-label*="more" i],[aria-label*="options" i]',
        poll:'[data-testid="poll-answer"],[role="radio"]',
        expand:'[data-testid="expand"],summary,[aria-expanded]',
        dismiss:'[data-testid*="cancel" i],[data-testid*="close" i],[aria-label*="cancel" i],[aria-label*="close" i]',
        submit:'button[type="submit"],[data-testid*="submit" i],[data-testid*="send" i]',
        permalink:'a[href]',
        input:'textarea,input:not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable="true"]',
        ...siteActionAliases(),
    });

    function normalizeControlTerm(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function interactionSignatureScore(a, b) {
        if (!a || !b || a.tag !== b.tag) return 0;
        let score = 8;
        const pairs = [
            ['testid', 120], ['aria', 108], ['title', 92], ['name', 86], ['href', 82], ['role', 54], ['text', 36],
        ];
        for (const [field, weight] of pairs) {
            const av = normalizeControlTerm(a[field]);
            const bv = normalizeControlTerm(b[field]);
            if (!av || !bv) continue;
            if (av === bv) score += weight;
            else if (av.includes(bv) || bv.includes(av)) score += Math.floor(weight * .42);
        }
        return score;
    }

    function interactionControlState(element) {
        return {
            pressed:element.getAttribute?.('aria-pressed') || '',
            ariaChecked:element.getAttribute?.('aria-checked') || '',
            disabled:Boolean(element.disabled || element.getAttribute?.('aria-disabled') === 'true'),
            checked:'checked' in element ? Boolean(element.checked) : undefined,
            value:'value' in element && !element.matches?.('input[type="password"]') ? String(element.value ?? '').slice(0, 400) : undefined,
        };
    }

    function annotateInteractionMirror(record, mirrorRoot = record?.clone) {
        if (!record || !(mirrorRoot instanceof Element)) return [];
        const mirrorControls = [...mirrorRoot.querySelectorAll(FULL_INTERACTIVE_SELECTOR)].filter((el) => el instanceof Element);
        for (let index = 0; index < mirrorControls.length; index += 1) {
            const mirror = mirrorControls[index];
            mirror.setAttribute('data-tu-control-key', String(index));
            let kind = '';
            for (const [action, selector] of Object.entries(RETAINED_ACTION_SELECTORS)) {
                if (action === 'input') continue;
                try { if (mirror.matches(selector)) { kind = action; break; } } catch {}
            }
            if (kind) {
                mirror.setAttribute('data-tu-action-kind', kind);
                const actionParent = mirror.parentElement;
                if (actionParent && actionParent.querySelectorAll(FULL_INTERACTIVE_SELECTOR).length >= 2) actionParent.setAttribute('data-tu-action-bar', '1');
            }
        }
        record.interactionMirrorCount = mirrorControls.length;
        return mirrorControls;
    }

    function ensureInteractionCapsule(record) {
        if (!record) return null;
        if (record.interactionCapsule?.controls?.size) return record.interactionCapsule;
        const source = locateMountedSource(record.id) || record.source;
        if (!(source instanceof Element) || !(record.clone instanceof Element)) return null;
        return captureInteractionCapsule(record, source, record.clone);
    }

    function captureInteractionCapsule(record, sourceRoot = record?.source, mirrorRoot = record?.clone) {
        if (!record || !(sourceRoot instanceof Element) || !(mirrorRoot instanceof Element)) return null;
        const nativeControls = [...sourceRoot.querySelectorAll(FULL_INTERACTIVE_SELECTOR)].filter((el) => el instanceof Element);
        const mirrorControls = annotateInteractionMirror(record, mirrorRoot);
        const native = nativeControls.map((element, index) => ({
            index,
            sig:controlSignature(element),
            state:interactionControlState(element),
        }));
        const controls = new Map();
        for (let index = 0; index < mirrorControls.length; index += 1) {
            const mirror = mirrorControls[index];
            const sig = controlSignature(mirror);
            let winner = null, winnerScore = -1;
            const direct = native[index];
            if (direct) {
                const directScore = interactionSignatureScore(sig, direct.sig);
                if (directScore >= 50) { winner = direct; winnerScore = directScore + 12; }
            }
            // cloneNode(true) preserves interactive-control order in the common path. Only pay the
            // signature search when sanitization/site rewrites actually shifted that order.
            if (!winner) {
                for (const candidate of native) {
                    const score = interactionSignatureScore(sig, candidate.sig);
                    if (score > winnerScore) { winner = candidate; winnerScore = score; }
                }
            }
            if (!winner || winnerScore < 24) continue;
            const key = String(index);
            let kind = '';
            for (const [action, selector] of Object.entries(RETAINED_ACTION_SELECTORS)) {
                if (action === 'input') continue;
                try { if (mirror.matches(selector)) { kind = action; break; } } catch {}
            }
            controls.set(key, {
                key,
                kind,
                sourceIndex:winner.index,
                nativeSig:winner.sig,
                mirrorSig:sig,
                state:winner.state,
            });
        }
        record.interactionCapsule = { capturedAt:Date.now(), controls, nativeCount:native.length, mirrorCount:mirrorControls.length };
        record.mirrorControlDescriptors = new WeakMap();
        state.interactionCapsules += 1;
        state.interactionCapsuleControls += controls.size;
        return record.interactionCapsule;
    }

    function capsuleEquivalentNode(record, descriptor, source) {
        const key = descriptor?.capsuleKey;
        if (!key || !record?.interactionCapsule?.controls || !(source instanceof Element)) return null;
        const saved = record.interactionCapsule.controls.get(key);
        if (!saved) return null;
        const currentControls = source.querySelectorAll(FULL_INTERACTIVE_SELECTOR);
        const byIndex = Number.isInteger(saved.sourceIndex) ? currentControls[saved.sourceIndex] : null;
        if (byIndex instanceof Element && interactionSignatureScore(descriptor.sig, controlSignature(byIndex)) >= 24) return byIndex;
        let winner = null, winnerScore = 0;
        for (const candidate of currentControls) {
            const score = interactionSignatureScore(saved.nativeSig, controlSignature(candidate));
            if (score > winnerScore) { winner = candidate; winnerScore = score; }
        }
        return winnerScore >= 24 ? winner : null;
    }

    function contextControlSnapshot(record, element, options = {}) {
        if (!record || !(element instanceof Element)) return null;
        const key = element.getAttribute('data-tu-control-key') || controlDescriptor(record, element)?.capsuleKey || '';
        if (!key) return null;
        const sig = controlSignature(element);
        const editable = element.getAttribute('contenteditable') === 'true';
        const password = element.matches?.('input[type="password"]');
        const fileInput = element.matches?.('input[type="file"]');
        const snapshot = {
            key,
            kind: interactionActionKind(element) || (element.matches?.(TEXT_EDIT_SELECTOR) ? 'input' : ''),
            sig,
            edited: Boolean(options.edited),
            updatedAt: Date.now(),
        };
        if (!password && !fileInput && 'value' in element) snapshot.value = String(element.value ?? '');
        if ('checked' in element) snapshot.checked = Boolean(element.checked);
        if (element instanceof HTMLSelectElement) snapshot.selectedIndex = element.selectedIndex;
        if (editable) {
            snapshot.html = element.innerHTML;
            snapshot.text = element.textContent || '';
        }
        if (element instanceof HTMLDetailsElement) snapshot.open = Boolean(element.open);
        for (const attr of CONTEXT_STATE_ATTRS) {
            if (element.hasAttribute(attr)) snapshot[attr] = element.getAttribute(attr) || '';
        }
        return snapshot;
    }

    function interactionContextSnapshotActive(snapshot) {
        if (!snapshot) return false;
        if (snapshot.edited) return true;
        if (snapshot.open === true) return true;
        if (snapshot['aria-expanded'] === 'true' || snapshot['aria-selected'] === 'true' || snapshot['aria-checked'] === 'true') return true;
        if (snapshot['data-state'] && /^(open|active|checked|selected|expanded)$/i.test(snapshot['data-state'])) return true;
        if (snapshot.kind === 'poll' && snapshot.checked === true) return true;
        return false;
    }

    function ensureInteractionContextStore() {
        if (state.interactionContextStore instanceof Map) return state.interactionContextStore;
        const store = new Map();
        try {
            const raw = sessionStorage.getItem(INTERACTION_CONTEXT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') {
                for (const [id, saved] of Object.entries(parsed)) {
                    if (!saved || typeof saved !== 'object') continue;
                    const controls = new Map();
                    for (const item of Array.isArray(saved.controls) ? saved.controls : []) {
                        if (item?.key) controls.set(String(item.key), item);
                    }
                    if (controls.size || saved.showText === '1') store.set(id, { updatedAt:Number(saved.updatedAt || 0), showText:saved.showText === '1' ? '1' : '0', controls });
                }
            }
        } catch {}
        state.interactionContextStore = store;
        state.interactionContextSessionLoads += 1;
        return store;
    }

    function savedInteractionContext(record) {
        if (!record?.id) return null;
        if (record.interactionContext?.controls instanceof Map) return record.interactionContext;
        const saved = ensureInteractionContextStore().get(record.id);
        if (!saved) return null;
        record.interactionContext = { updatedAt:saved.updatedAt || 0, showText:saved.showText || '0', controls:new Map(saved.controls) };
        return record.interactionContext;
    }

    function ensureInteractionContext(record) {
        if (!record) return null;
        return savedInteractionContext(record) || (record.interactionContext = { updatedAt:Date.now(), showText:'0', controls:new Map() });
    }

    function flushInteractionContextStore() {
        clearTimeout(state.interactionContextSaveTimer);
        state.interactionContextSaveTimer = 0;
        const store = ensureInteractionContextStore();
        const payload = {};
        for (const [id, context] of store) {
            if (!context?.controls?.size && context?.showText !== '1') continue;
            payload[id] = { updatedAt:context.updatedAt || Date.now(), showText:context.showText || '0', controls:[...context.controls.values()] };
        }
        try {
            sessionStorage.setItem(INTERACTION_CONTEXT_STORAGE_KEY, JSON.stringify(payload));
            state.interactionContextSessionSaves += 1;
        } catch {}
    }

    function scheduleInteractionContextSave(record) {
        if (!record?.id || !record.interactionContext) return;
        const store = ensureInteractionContextStore();
        if (record.interactionContext.controls.size || record.interactionContext.showText === '1') store.set(record.id, record.interactionContext);
        else store.delete(record.id);
        clearTimeout(state.interactionContextSaveTimer);
        state.interactionContextSaveTimer = setTimeout(flushInteractionContextStore, 120);
    }

    function rememberInteractionContext(record, element, options = {}) {
        const snapshot = contextControlSnapshot(record, element, options);
        if (!snapshot) return null;
        const context = ensureInteractionContext(record);
        if (!context) return null;
        const existing = context.controls.get(snapshot.key);
        if (existing?.edited && !snapshot.edited) snapshot.edited = true;
        if (interactionContextSnapshotActive(snapshot)) context.controls.set(snapshot.key, snapshot);
        else context.controls.delete(snapshot.key);
        context.updatedAt = Date.now();
        if (record.item?.dataset?.tuShowText === '1') context.showText = '1';
        state.interactionContextCaptures += 1;
        scheduleInteractionContextSave(record);
        return snapshot;
    }

    function clearInteractionContext(record, { drafts = false, all = false } = {}) {
        const context = savedInteractionContext(record);
        if (!context) return;
        if (all) context.controls.clear();
        else if (drafts) {
            for (const [key, snapshot] of [...context.controls]) if (snapshot?.edited || snapshot?.kind === 'input') context.controls.delete(key);
        }
        context.updatedAt = Date.now();
        scheduleInteractionContextSave(record);
    }

    function contextMirrorTarget(root, snapshot) {
        if (!(root instanceof Element) || !snapshot) return null;
        if (snapshot.key) {
            try {
                const direct = root.querySelector(`[data-tu-control-key="${cssAttrValue(snapshot.key)}"]`);
                if (direct && interactionSignatureScore(snapshot.sig, controlSignature(direct)) >= 24) return direct;
            } catch {}
        }
        let winner = null, winnerScore = 0;
        for (const candidate of root.querySelectorAll(FULL_INTERACTIVE_SELECTOR)) {
            const score = interactionSignatureScore(snapshot.sig, controlSignature(candidate));
            if (score > winnerScore) { winner = candidate; winnerScore = score; }
        }
        return winnerScore >= 24 ? winner : null;
    }

    function applyContextSnapshot(element, snapshot) {
        if (!(element instanceof Element) || !snapshot) return false;
        const editable = element.getAttribute('contenteditable') === 'true';
        try {
            if (snapshot.value !== undefined && 'value' in element && !element.matches?.('input[type="password"],input[type="file"]')) element.value = String(snapshot.value);
            if (snapshot.checked !== undefined && 'checked' in element) element.checked = Boolean(snapshot.checked);
            if (snapshot.selectedIndex !== undefined && element instanceof HTMLSelectElement) element.selectedIndex = Number(snapshot.selectedIndex);
            if (editable && snapshot.html !== undefined) element.innerHTML = String(snapshot.html);
            if (element instanceof HTMLDetailsElement && snapshot.open !== undefined) element.open = Boolean(snapshot.open);
            for (const attr of CONTEXT_STATE_ATTRS) if (snapshot[attr] !== undefined) element.setAttribute(attr, String(snapshot[attr]));
            return true;
        } catch { return false; }
    }

    function restoreInteractionContext(record, mirrorRoot = record?.clone) {
        const context = savedInteractionContext(record);
        if (!context || !(mirrorRoot instanceof Element)) return 0;
        annotateInteractionMirror(record, mirrorRoot);
        let restored = 0;
        for (const snapshot of context.controls.values()) {
            const target = contextMirrorTarget(mirrorRoot, snapshot);
            if (target && applyContextSnapshot(target, snapshot)) restored += 1;
        }
        if (context.showText === '1' && record.item) record.item.dataset.tuShowText = '1';
        if (restored) state.interactionContextRestores += restored;
        return restored;
    }

    function missingStickyInteractionContext(record, mirrorRoot) {
        const context = savedInteractionContext(record);
        if (!context || !(mirrorRoot instanceof Element)) return 0;
        let missing = 0;
        for (const snapshot of context.controls.values()) {
            if (!interactionContextSnapshotActive(snapshot)) continue;
            if (!contextMirrorTarget(mirrorRoot, snapshot)) missing += 1;
        }
        return missing;
    }

    function mergeFreshInteractiveState(record, freshRoot, currentRoot) {
        if (!(freshRoot instanceof Element) || !(currentRoot instanceof Element)) return 0;
        annotateInteractionMirror(record, freshRoot);
        annotateInteractionMirror(record, currentRoot);
        const context = savedInteractionContext(record);
        let merged = 0;
        for (const fresh of freshRoot.querySelectorAll(FULL_INTERACTIVE_SELECTOR)) {
            if (!(fresh instanceof Element)) continue;
            const key = fresh.getAttribute('data-tu-control-key') || '';
            let current = key ? currentRoot.querySelector(`[data-tu-control-key="${cssAttrValue(key)}"]`) : null;
            if (!current || interactionSignatureScore(controlSignature(fresh), controlSignature(current)) < 24) {
                const snapshot = { key:'', sig:controlSignature(fresh) };
                current = contextMirrorTarget(currentRoot, snapshot);
            }
            if (!(current instanceof Element)) continue;
            const owned = key ? context?.controls?.get(key) : null;
            try {
                for (const attr of [...CONTEXT_STATE_ATTRS,'aria-label','title','disabled']) {
                    if (owned && interactionContextSnapshotActive(owned) && CONTEXT_STATE_ATTRS.includes(attr)) continue;
                    if (fresh.hasAttribute(attr)) current.setAttribute(attr, fresh.getAttribute(attr) || '');
                    else current.removeAttribute(attr);
                }
                if ((!owned || !owned.edited) && 'checked' in fresh && 'checked' in current) current.checked = Boolean(fresh.checked);
                merged += 1;
            } catch {}
        }
        return merged;
    }

    function rememberNativeInteractionContext(record, mirror, actual) {
        if (!record || !(mirror instanceof Element) || !(actual instanceof Element)) return null;
        const snapshot = contextControlSnapshot(record, mirror, { edited:false });
        if (!snapshot) return null;
        const nativeState = interactionControlState(actual);
        snapshot.checked = nativeState.checked;
        for (const attr of CONTEXT_STATE_ATTRS) if (actual.hasAttribute(attr)) snapshot[attr] = actual.getAttribute(attr) || '';
        if (actual instanceof HTMLDetailsElement) snapshot.open = actual.open;
        const context = ensureInteractionContext(record);
        if (interactionContextSnapshotActive(snapshot)) context.controls.set(snapshot.key, snapshot);
        else context.controls.delete(snapshot.key);
        context.updatedAt = Date.now();
        state.interactionContextCaptures += 1;
        scheduleInteractionContextSave(record);
        applyContextSnapshot(mirror, snapshot);
        return snapshot;
    }

    function retainedControlDescriptors(record) {
        if (!record?.clone) return [];
        const controls = [];
        let index = 0;
        for (const element of record.clone.querySelectorAll(FULL_INTERACTIVE_SELECTOR)) {
            if (!(element instanceof Element)) continue;
            const sig = controlSignature(element);
            controls.push({
                index:index++,
                testid:sig.testid,
                aria:sig.aria,
                title:sig.title,
                role:sig.role,
                href:sig.href,
                name:sig.name,
                text:sig.text,
                tag:sig.tag,
                type:String(element.getAttribute('type') || ''),
                checked:'checked' in element ? Boolean(element.checked) : undefined,
                value:'value' in element ? String(element.value ?? '') : undefined,
            });
        }
        return controls;
    }

    function scoreRetainedControl(element, wanted) {
        if (!(element instanceof Element) || !wanted) return 0;
        const sig = controlSignature(element);
        const fields = [
            [sig.testid, 120, 82],
            [sig.aria, 112, 76],
            [sig.title, 104, 70],
            [sig.name, 96, 64],
            [sig.role, 80, 48],
            [sig.text, 72, 42],
            [element.getAttribute('type') || '', 62, 36],
            [sig.href, 44, 24],
            [sig.tag, 28, 16],
        ];
        let best = 0;
        for (const [raw, exact, partial] of fields) {
            const value = normalizeControlTerm(raw);
            if (!value) continue;
            if (value === wanted) best = Math.max(best, exact);
            else if (value.includes(wanted) || wanted.includes(value)) best = Math.max(best, partial);
            else {
                const tokens = wanted.split(' ').filter(Boolean);
                if (tokens.length && tokens.every((token) => value.includes(token))) best = Math.max(best, partial - 6);
            }
        }
        return best;
    }

    function retainedMirrorTarget(record, action) {
        if (!record?.clone) return null;
        if (action instanceof Element) return record.clone.contains(action) ? action : null;
        if (action && typeof action === 'object') {
            if (Number.isInteger(action.index) && action.index >= 0) {
                return record.clone.querySelectorAll(FULL_INTERACTIVE_SELECTOR)[action.index] || null;
            }
            for (const field of ['selector','testid','aria','title','name','role','text']) {
                if (!(field in action)) continue;
                const value = String(action[field] || '').trim();
                if (!value) continue;
                if (field === 'selector') { try { const match = record.clone.querySelector(value); if (match) return match; } catch {} continue; }
                const wanted = normalizeControlTerm(value);
                let winner = null, score = 0;
                for (const element of record.clone.querySelectorAll(FULL_INTERACTIVE_SELECTOR)) {
                    const sig = controlSignature(element);
                    const candidate = normalizeControlTerm(field === 'text' ? sig.text : sig[field]);
                    const next = candidate === wanted ? 2 : candidate.includes(wanted) ? 1 : 0;
                    if (next > score) { winner = element; score = next; if (score === 2) break; }
                }
                if (winner) return winner;
            }
        }
        const raw = String(action || 'like').trim();
        const key = normalizeControlTerm(raw);
        const alias = RETAINED_ACTION_SELECTORS[key];
        if (alias) { try { const match = record.clone.querySelector(alias); if (match) return match; } catch {} }
        try { const exactSelector = record.clone.querySelector(raw); if (exactSelector) return exactSelector; } catch {}
        let winner = null, winnerScore = 0;
        for (const element of record.clone.querySelectorAll(FULL_INTERACTIVE_SELECTOR)) {
            const score = scoreRetainedControl(element, key);
            if (score > winnerScore) { winner = element; winnerScore = score; }
        }
        return winnerScore >= 30 ? winner : null;
    }

    async function interactRetainedPost(id, action = 'like', options = {}) {
        const record = state.cache.get(String(id || '').trim());
        if (!record) return { ok:false, reason:'post-not-retained', id:String(id || '') };
        const target = retainedMirrorTarget(record, action);
        if (!target) return { ok:false, reason:'control-not-found', id:record.id, action:String(action || '') };
        if (target.matches?.(TEXT_EDIT_SELECTOR) && ('value' in options || 'checked' in options || 'text' in options || 'html' in options || options.input === true)) {
            return runNativeInteractionTransaction(record, async () => {
                const actual = await nativeEquivalent(record, target, { stage:false });
                if (!actual) { state.interactionFailures += 1; return { ok:false, reason:'native-source-unavailable', id:record.id }; }
                try {
                    const editable = target.getAttribute('contenteditable') === 'true';
                    if (editable) {
                        if ('html' in options) target.innerHTML = String(options.html ?? '');
                        else if ('text' in options || 'value' in options) target.textContent = String(('text' in options ? options.text : options.value) ?? '');
                    } else if ('value' in options && 'value' in target) target.value = String(options.value ?? '');
                    if ('checked' in options && 'checked' in target) target.checked = Boolean(options.checked);
                    if ('value' in target && 'value' in actual) actual.value = target.value;
                    if ('checked' in target && 'checked' in actual) actual.checked = target.checked;
                    if (target instanceof HTMLSelectElement && actual instanceof HTMLSelectElement) actual.selectedIndex = target.selectedIndex;
                    if (editable && actual.getAttribute?.('contenteditable') === 'true') actual.innerHTML = target.innerHTML;
                    const type = options.eventType === 'change' ? 'change' : 'input';
                    const Ctor = type === 'input' && typeof InputEvent === 'function' ? InputEvent : Event;
                    actual.dispatchEvent(new Ctor(type, { bubbles:true, composed:true }));
                    state.nativeInputSyncs += 1;
                    state.interactionProgrammaticActions += 1;
                    return {
                        ok:true, id:record.id, input:true,
                        value:'value' in target ? target.value : undefined,
                        checked:'checked' in target ? target.checked : undefined,
                        text:editable ? target.textContent : undefined,
                        html:editable ? target.innerHTML : undefined,
                    };
                } catch {
                    state.interactionFailures += 1;
                    return { ok:false, reason:'native-input-threw', id:record.id };
                }
            });
        }
        return executeMirrorAction(record, target, { programmatic:true });
    }

    async function proxyInteractiveClick(event) {
        if (!state.grid?.contains(event.target)) return;
        const peek = event.target instanceof Element ? event.target.closest('.tu-text-peek') : null;
        if (peek) {
            event.preventDefault(); event.stopPropagation();
            const item = peek.closest('.tu-item');
            if (item) {
                item.dataset.tuShowText = item.dataset.tuShowText === '1' ? '0' : '1';
                const record = state.cache.get(item.dataset.tuItem || '');
                if (record) {
                    const context = ensureInteractionContext(record);
                    if (context) { context.showText = item.dataset.tuShowText === '1' ? '1' : '0'; context.updatedAt = Date.now(); scheduleInteractionContextSave(record); }
                    syncTextPeek(record);
                }
                updateRecordMeasurement(item);
                scheduleGeometryAudit(40);
            }
            return;
        }
        const target = event.target instanceof Element ? event.target.closest(FULL_INTERACTIVE_SELECTOR) : null;
        if (!target) return;
        if (target.closest('video,audio') || target instanceof HTMLVideoElement || target instanceof HTMLAudioElement) return;
        if (target.matches(TEXT_EDIT_SELECTOR)) return; // clone stays the visible editor; input/change mirrors state to React.
        const record = mirrorRecordFromNode(target);
        if (!record) return;
        event.preventDefault();
        event.stopPropagation();
        const result = await executeMirrorAction(record, target);
        if (!result.ok) showToast(`${SITE_LABEL} could not reconnect that native action automatically.`);
    }

    function createHud() {
        if (state.hud?.isConnected) return;
        const host = document.createElement('div');
        host.id = `${ID}-ui`;
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        const sh = host.attachShadow({ mode:'open' });
        sh.innerHTML = `
        <style>
          *{box-sizing:border-box}button,input{font:inherit}.edge,.dock,.panel{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
          .edge{position:fixed;top:50%;transform:translateY(-50%);height:42px;padding:0 10px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(145deg,rgba(19,22,32,.96),rgba(8,10,16,.92));color:#fff;box-shadow:0 14px 40px #0008;pointer-events:auto;cursor:pointer;text-transform:uppercase;font-size:10px;font-weight:900;letter-spacing:.11em;backdrop-filter:blur(16px);display:flex;gap:6px;align-items:center}.edge:hover{border-color:#50d7ff88}.edge.left{left:0;border-radius:0 13px 13px 0}.edge.right{right:0;border-radius:13px 0 0 13px}.chev{font-size:16px;color:#57dbff}.closed{background:linear-gradient(145deg,#14293aee,#09111cee)}
          .wrap{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto}.dock{height:48px;padding:6px;display:flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:linear-gradient(145deg,rgba(17,20,29,.95),rgba(7,9,15,.91));box-shadow:0 20px 60px #0009;backdrop-filter:blur(20px)}.dock button{height:34px;border:0;border-radius:11px;background:transparent;color:#d7dbe5;padding:0 11px;cursor:pointer;font-size:12px;font-weight:800}.dock button:hover{background:#ffffff13;color:#fff}.dock .mini{width:34px;padding:0;font-size:17px}.readout{min-width:116px!important;background:#ffffff0e!important}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3fe8a3;box-shadow:0 0 12px #3fe8a3aa;margin-right:7px}.dot.warn{background:#ffc650;box-shadow:0 0 12px #ffc650aa}.dot.bad{background:#ff5d72;box-shadow:0 0 12px #ff5d72aa}.focus.on{background:linear-gradient(135deg,#66e0ff,#a38dff)!important;color:#081016!important}.sep{height:22px;width:1px;background:#ffffff18;margin:0 2px}
          .panel{position:absolute;left:50%;bottom:58px;transform:translateX(-50%) translateY(8px);width:min(620px,calc(100vw - 24px));padding:15px;border:1px solid rgba(255,255,255,.14);border-radius:20px;background:linear-gradient(155deg,rgba(20,23,34,.98),rgba(8,10,16,.97));box-shadow:0 28px 90px #000b;color:#fff;opacity:0;visibility:hidden;pointer-events:none;transition:.16s ease}.panel.open{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(-50%) translateY(0)}.head{display:flex;justify-content:space-between;gap:14px;margin-bottom:12px}.title{font-size:15px;font-weight:900}.sub{font-size:10px;color:#9299ab;margin-top:3px}.badge{font-size:10px;font-weight:900;color:#7fe4ff;background:#55d8ff16;border-radius:999px;padding:5px 8px;white-space:nowrap}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.field{padding:10px;border:1px solid #ffffff12;border-radius:13px;background:#ffffff07}.field.full{grid-column:1/-1}.row{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;font-size:11px;font-weight:800;color:#d2d6df}.val{color:#67ddff}.field input{width:100%;accent-color:#56d9ff}.presets{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}.preset{height:28px!important;padding:0!important;border:1px solid #ffffff12!important;background:#ffffff08!important}.preset.on{background:linear-gradient(135deg,#66e0ff,#a38dff)!important;color:#071018!important}.toggles{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.segments{display:grid;grid-template-columns:1fr 1fr;gap:6px}.segment{border:1px solid #ffffff12!important;background:#ffffff07!important}.segment.on{background:linear-gradient(135deg,#66e0ff,#a38dff)!important;color:#071018!important;border-color:transparent!important}.toggle{display:flex;justify-content:space-between;align-items:center;border:1px solid #ffffff12!important;background:#ffffff07!important}.toggle.on{border-color:#57dfff55!important;color:#8feaff}.actions{display:flex;gap:7px;margin-top:10px}.actions button{flex:1;border:1px solid #ffffff15!important;background:#ffffff08!important}.diag{font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#939aaa;margin-top:10px;white-space:normal;word-break:break-word}
          @media(max-width:800px){.edge{display:none}.hideSmall{display:none!important}.fields{grid-template-columns:1fr}.field.full{grid-column:1}.presets{grid-template-columns:repeat(4,1fr)}}
        </style>
        <button class="edge left" data-act="left"><span class="chev" data-lchev>‹</span><span>NAV</span></button>
        <button class="edge right" data-act="right"><span>EXTRAS</span><span class="chev" data-rchev>›</span></button>
        <div class="wrap"><div class="panel" data-panel>
          <div class="head"><div><div class="title">${SITE_LABEL} UltraWide Deck</div><div class="sub">v${VERSION} · UltraDeck v8.2 · persistent off-screen actions · intent wakeups · transaction-safe virtualizer · instant HQ media · masonry or aligned rows</div></div><div class="badge" data-badge>SCANNING</div></div>
          <div class="fields">
            <div class="field"><div class="row"><span>Minimum card width</span><span class="val" data-val="minCardWidth"></span></div><input type="range" min="160" max="720" step="10" data-setting="minCardWidth"></div>
            <div class="field"><div class="row"><span>Maximum columns</span><span class="val" data-val="maxColumns"></span></div><input type="range" min="1" max="20" step="1" data-setting="maxColumns"></div>
            <div class="field"><div class="row"><span>Minimum card height</span><span class="val" data-val="minCardHeight"></span></div><input type="range" min="0" max="1200" step="20" data-setting="minCardHeight"></div>
            <div class="field"><div class="row"><span>Post gap</span><span class="val" data-val="gap"></span></div><input type="range" min="4" max="48" step="1" data-setting="gap"></div>
            <div class="field"><div class="row"><span>Outer gutter</span><span class="val" data-val="gutter"></span></div><input type="range" min="0" max="72" step="1" data-setting="gutter"></div>
            <div class="field full"><div class="row"><span>Column presets</span><span class="val">verified rendered columns</span></div><div class="presets">${['auto',2,3,4,5,6,8,10,12,16,20].map((v)=>`<button class="preset" data-col="${v}">${String(v).toUpperCase()}</button>`).join('')}</div></div>
            <div class="field full"><div class="row"><span>Post alignment</span><span class="val">switch without losing posts</span></div><div class="segments"><button class="segment" data-layout="masonry">Masonry</button><button class="segment" data-layout="rows">Aligned rows</button></div></div>
            <div class="field full"><div class="toggles"><button class="toggle" data-toggle="mediaOnly">Images-first view</button><button class="toggle" data-toggle="compact">Compact text</button><button class="toggle" data-toggle="softRails">Soft rails</button><button class="toggle" data-toggle="proactiveBuffer">Proactive buffer</button><button class="toggle" data-toggle="turboMedia">Turbo media</button><button class="toggle" data-toggle="liveInteraction">Native-backed actions</button><button class="toggle" data-toggle="adaptivePerformance">Adaptive engine</button><button class="toggle" data-act="focus">Focus mode</button></div></div>
          </div>
          <div class="actions"><button data-act="buffer">Buffer more posts</button><button data-act="rebalance">Rebalance</button><button data-act="rescan">Full rescan</button><button data-act="reset">Reset</button></div><div class="diag" data-diag>Waiting for ${SITE_LABEL}…</div>
        </div><div class="dock">
          <button class="mini hideSmall" data-act="left">◀</button><span class="sep hideSmall"></span><button class="mini" data-act="minus">−</button><button class="readout" data-act="auto"><span class="dot" data-dot></span><span data-readout>AUTO</span></button><button class="mini" data-act="plus">+</button><span class="sep"></span><button class="focus" data-act="focus" data-focus>Focus</button><button class="mini" data-act="panel">⚙</button><span class="sep hideSmall"></span><button class="mini hideSmall" data-act="right">▶</button>
        </div></div>`;
        document.documentElement.appendChild(host);
        state.hud = host; state.shadow = sh;
        sh.addEventListener('click', (event) => {
            const b = event.target.closest('button'); if (!b) return;
            const act = b.dataset.act, col = b.dataset.col, toggle = b.dataset.toggle, layout = b.dataset.layout;
            if (col) { setColumns(col === 'auto' ? 'auto' : Number(col)); return; }
            if (layout) { settings.layoutMode = layout === 'rows' ? 'rows' : 'masonry'; saveSettings(); applyColumns(); syncControls(); return; }
            if (toggle) {
                settings[toggle] = !settings[toggle]; saveSettings();
                if (toggle === 'softRails') discoverRails();
                if (toggle === 'compact' && state.shell) state.shell.dataset.tuCompact = settings.compact ? '1' : '0';
                if (toggle === 'mediaOnly') { if (state.shell) state.shell.dataset.tuMediaOnly = settings.mediaOnly ? '1' : '0'; scheduleGeometryAudit(40); }
                if (toggle === 'turboMedia') syncAllMedia();
                if (toggle === 'liveInteraction' && !settings.liveInteraction) deactivateLiveInteraction();
                syncControls(); return;
            }
            if (act === 'left') toggleLeft();
            if (act === 'right') toggleRight();
            if (act === 'minus') bumpColumns(-1);
            if (act === 'plus') bumpColumns(1);
            if (act === 'auto') setColumns('auto');
            if (act === 'focus') toggleFocus();
            if (act === 'panel') sh.querySelector('[data-panel]').classList.toggle('open');
            if (act === 'buffer') ensureBuffer(adaptiveBufferTarget(4), 'manual');
            if (act === 'rebalance') { rebuildColumns(true); scheduleGeometryAudit(40); }
            if (act === 'rescan') fullRescan();
            if (act === 'reset') { settings = { ...defaults }; saveSettings(); discoverRails(); syncControls(); }
        });
        sh.addEventListener('input', (event) => {
            const input = event.target.closest('input[data-setting]'); if (!input) return;
            const k = input.dataset.setting;
            settings[k] = Number(input.value);
            if (k === 'maxColumns') settings[k] = clamp(settings[k], 1, MAX_COLUMNS);
            if (k === 'minCardWidth') settings[k] = clamp(settings[k], 160, 720);
            if (k === 'minCardHeight') settings[k] = clamp(settings[k], 0, 1600);
            if (k === 'gap') settings[k] = clamp(settings[k], 4, 48);
            if (k === 'gutter') settings[k] = clamp(settings[k], 0, 72);
            if (k === 'maxColumns' && settings.columns !== 'auto' && settings.columns > settings.maxColumns) settings.columns = settings.maxColumns;
            saveSettings(); if (k === 'gutter') discoverRails(); else updateGeometry(); syncControls();
        });
        syncControls(); updateHud();
    }

    function syncControls() {
        const sh = state.shadow; if (!sh) return;
        const format = { minCardWidth:(v)=>`${v}px`, minCardHeight:(v)=>v ? `${v}px` : 'Natural', maxColumns:(v)=>String(v), gap:(v)=>`${v}px`, gutter:(v)=>`${v}px` };
        sh.querySelectorAll('input[data-setting]').forEach((i) => {
            const k = i.dataset.setting; i.value = String(settings[k]);
            const v = sh.querySelector(`[data-val="${k}"]`); if (v) v.textContent = format[k]?.(settings[k]) ?? String(settings[k]);
        });
        syncColumnControls();
        sh.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === settings.layoutMode));
        sh.querySelectorAll('[data-toggle]').forEach((b) => b.classList.toggle('on', !!settings[b.dataset.toggle]));
    }

    function updateHud() {
        const sh = state.shadow; if (!sh) return;
        updateDiagnostics(false);
        const enough = state.cache.size >= state.actualColumns;
        const correct = state.renderedColumns >= Math.min(state.actualColumns, state.cache.size);
        const dot = sh.querySelector('[data-dot]');
        dot.classList.toggle('warn', state.prefetching || !enough);
        dot.classList.toggle('bad', enough && !correct);
        sh.querySelector('[data-readout]').textContent = `${settings.columns === 'auto' ? 'AUTO · ' : ''}${state.actualColumns} COL`;
        const badge = sh.querySelector('[data-badge]');
        badge.textContent = state.prefetching ? `BUFFERING · ${state.cache.size}` : `${state.renderedColumns}/${state.actualColumns} RENDERED`;
        sh.querySelector('[data-focus]').classList.toggle('on', settings.focus);
        const leftOpen = !settings.focus && settings.leftOpen, rightOpen = !settings.focus && settings.rightOpen;
        sh.querySelector('[data-lchev]').textContent = leftOpen ? '‹' : '›';
        sh.querySelector('[data-rchev]').textContent = rightOpen ? '›' : '‹';
        sh.querySelectorAll('[data-act="left"]').forEach((b) => b.classList.toggle('closed', !leftOpen));
        sh.querySelectorAll('[data-act="right"]').forEach((b) => b.classList.toggle('closed', !rightOpen));
        const d = state.diagnostics || {};
        const panel = sh.querySelector('[data-panel]');
        if (panel?.classList.contains('open')) {
            updateDiagnostics(true);
            const live = state.diagnostics || d;
            sh.querySelector('[data-diag]').textContent = `site ${SITE_LABEL} · route ${siteRouteKey()} · ${state.layoutMode}/${settings.mediaOnly ? 'images-first' : 'full'} · top ${live.deckTop || 0}px ${live.topAnchorSource || ''} · posts ${state.cache.size} · rendered ${state.renderedColumns}/${state.actualColumns} · media ${live.mediaPending || 0} net/${live.mediaQualityPending || 0} quality/${live.mediaPlaceholderRejects || 0} LQIP rejected/${live.mediaDirectStarts || 0} direct · hidden text ${live.hiddenTextRegions || 0} · geometry ${live.geometryViolations || 0} · harvest ${live.incrementalHarvests || 0}/${live.fullScans || 0} full q${live.postBuildQueued || 0} · long ${live.longTaskCount || 0}/${live.longTaskMs || 0}ms · action ${live.livePost || 'idle'} · rails L:${live.leftDetected ? 'yes' : '?'} R:${live.rightDetected ? 'yes' : '?'}`;
        }
        syncControls();
    }

    function routeFingerprint() {
        let timeline = state.timeline?.isConnected ? state.timeline : null;
        if (!timeline) {
            try {
                timeline = [...document.querySelectorAll(TIMELINE_SELECTOR)].find((el) => !state.shell?.contains(el) && !el.closest('aside,[role="complementary"]')) || null;
            } catch {}
        }
        return `${location.href}|${siteRouteKey()}|${timelineKey(timeline)}`;
    }

    function routeChanged() {
        const fingerprint = routeFingerprint();
        if (fingerprint === state.route) return;
        deactivateLiveInteraction();
        state.route = fingerprint;
        clearMirror();
        state.timeline = null;
        state.top = 92;
        state.topUtilityBottom = 0;
        state.topAnchorRoute = location.pathname;
        state.railDiscoveryComplete = false;
        state.railDiscoveryRoute = '';
        // Navigation has already committed the new route controls before history fires. Resolve the
        // top anchor immediately so the first new cards cannot briefly occupy the old route slot;
        // the delayed route pass below revalidates once Tumblr finishes mounting.
        discoverTop();
        const root = document.scrollingElement || document.documentElement;
        root.scrollTop = 0;
        try { window.scrollTo(0, 0); } catch {}
        clearTimeout(state.routeTimer);
        state.routeTimer = setTimeout(() => {
            discoverTop();
            discoverRails(true);
            captureVisiblePosts();
            if (settings.proactiveBuffer) ensureBuffer(Math.max(adaptiveBufferTarget(), 28), 'route');
        }, 260);
    }

    function scheduleScan(delay = 80) {
        clearTimeout(state.scanTimer);
        state.scanTimer = setTimeout(() => {
            routeChanged();
            const added = captureVisiblePosts();
            if (added) scheduleMasonry();
            verifyRailClosed('left'); verifyRailClosed('right');
            if (!state.left.frame?.isConnected && !state.left.fragments.some(connected)) discoverRails();
            if (!state.right.frame?.isConnected && !state.right.fragments.some(connected)) discoverRails();
        }, delay);
    }

    function installObservers() {
        if (state.mutationObserver) return;
        state.mutationObserver = new MutationObserver((mutations) => {
            let railish = false, topish = false;
            const mediaPosts = new Map();
            const watchingSources = state.interactionRegistryActive || state.sourceMountWaiters.size > 0;
            // A single React commit can emit dozens of MutationRecords for the same post target.
            // Resolve target -> post -> id only once per observer delivery, then reuse that frozen
            // semantic identity across every record in the batch. This preserves every mutation and
            // media/native-source wakeup while removing repeated ancestor walks and ID normalization.
            const targetPostInfo = new WeakMap();
            const sourcePosts = watchingSources ? new Map() : null;
            const resolveTargetPost = (target) => {
                if (!(target instanceof Element)) return null;
                const cached = targetPostInfo.get(target);
                if (cached) return cached;
                const post = closestSourcePost(target);
                const id = post instanceof HTMLElement ? String(postId(post) || '').trim() : '';
                const retained = Boolean(id && state.cache.has(id));
                const info = { post: post instanceof HTMLElement ? post : null, id, retained };
                targetPostInfo.set(target, info);
                if (retained) mediaPosts.set(id, post);
                if (sourcePosts && id && post instanceof HTMLElement) sourcePosts.set(id, post);
                return info;
            };
            for (const m of mutations) {
                if (state.hud?.contains(m.target) || state.shell?.contains(m.target)) continue;
                if (m.type === 'attributes') {
                    if (isRouteAttribute(m.attributeName)) {
                        queueMicrotask(routeChanged);
                        continue;
                    }
                    if (isIdentityAttribute(m.attributeName)) {
                        // Patreon/X mutate href attributes aggressively for navigation, analytics and
                        // controls. A href without this adapter's permalink evidence cannot change a
                        // retained post identity, so reject it before ancestor walking or ID parsing.
                        if (m.attributeName === 'href' && m.target instanceof Element) {
                            const href = String(m.target.getAttribute('href') || '');
                            const evidence = String(SITE.timelineEvidenceSelector || '');
                            const looksLikePostLink = SITE_ID === 'x' ? /\/status\/\d+/i.test(href)
                                : SITE_ID === 'patreon' ? /\/posts\/(?:[^/?#]*?-)?\d+(?:[/?#]|$)/i.test(href)
                                : true;
                            if (evidence && !looksLikePostLink) { state.identityMutationSkips += 1; continue; }
                        }
                        // Expensive permalink-derived adapters keep a weak identity cache. Invalidate
                        // the owning post before re-reading a recycled href/data ID; adapters also
                        // self-validate cached link+href tokens so synchronous consumers stay exact.
                        const post = m.target instanceof Element ? closestSourcePost(m.target) : null;
                        if (post instanceof HTMLElement && SITE_INVALIDATE_POST_ID) SITE_INVALIDATE_POST_ID(post);
                        targetPostInfo.delete(m.target);
                        const info = resolveTargetPost(m.target);
                        if (info?.post) queueHarvest(info.post);
                        continue;
                    }
                    const info = resolveTargetPost(m.target);
                    if (!info?.retained && m.target instanceof Element && mutationMayAffectTop(m.target)) topish = true;
                    continue;
                }
                if (m.type !== 'childList' || (!m.addedNodes.length && !m.removedNodes.length)) continue;

                const sourceInfo = resolveTargetPost(m.target);
                const sourcePost = sourceInfo?.post || null;
                const sourceId = sourceInfo?.id || '';
                const retainedSourceMutation = Boolean(sourceInfo?.retained);

                for (const node of m.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (watchingSources) rememberMountedSourcesFromNode(node);
                    if (retainedSourceMutation) {
                        // Descendant churn inside an already-retained post cannot create a sibling
                        // timeline card. Only pay the harvest path when an actual post shell appears.
                        // Media/state reconciliation for the parent is coalesced once per observer batch.
                        if (nodeContainsPostCandidate(node)) queueHarvest(node);
                        continue;
                    }
                    queueHarvest(node);
                    if (node.matches?.('aside,nav,[role="navigation"],[role="complementary"]') || node.querySelector?.('aside,nav,[role="navigation"],[role="complementary"]')) railish = true;
                    if (mutationMayAffectTop(node)) topish = true;
                }
                if (retainedSourceMutation) continue;
                for (const node of m.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (watchingSources) forgetMountedSourcesFromNode(node);
                    if (node.matches?.('aside,nav,[role="navigation"],[role="complementary"]') || node.querySelector?.('aside,nav,[role="navigation"],[role="complementary"]')) railish = true;
                    if (mutationMayAffectTop(node)) topish = true;
                }
            }
            if (sourcePosts) for (const [id, post] of sourcePosts) rememberMountedSource(post, id);
            for (const [id, post] of mediaPosts) {
                const record = state.cache.get(id);
                if (!record) continue;
                record.source = post;
                queueMediaSync(record);
            }
            if (railish) {
                clearTimeout(state.railTimer);
                state.railTimer = setTimeout(() => {
                    discoverRails(true);
                    verifyRailClosed('left'); verifyRailClosed('right');
                }, 45);
            }
            if (topish) scheduleTopDiscovery(70);
        });
        state.mutationObserver.observe(document.documentElement, {
            childList:true,
            subtree:true,
            attributes:true,
            attributeFilter:OBSERVED_ATTRIBUTES,
        });

        const mediaReady = (event) => {
            const target = event.target;
            if (!(target instanceof Element) || state.shell?.contains(target)) return;
            const post = closestSourcePost(target);
            const id = postId(post);
            if (!id || !state.cache.has(id)) return;
            const record = state.cache.get(id);
            record.source = post;
            if (target instanceof HTMLImageElement) {
                const sourceImages = [...post.querySelectorAll('img')];
                const index = sourceImages.indexOf(target);
                const mirror = index >= 0 ? record.clone?.querySelectorAll('img')?.[index] : null;
                if (mirror instanceof HTMLImageElement && mirror.dataset.tuSelectedUrl) {
                    reserveMediaGeometry(target, mirror);
                    if (mirror.complete && mirror.naturalWidth > 0) finalizeMirrorImageQuality(mirror, record);
                    const item = mirror.closest('.tu-item');
                    if (item) markSpanDirty(item);
                    return;
                }
            }
            queueMediaSync(record);
        };
        document.addEventListener('load', mediaReady, true);
        document.addEventListener('loadedmetadata', mediaReady, true);

        // Supported sites are SPAs. Catch history changes even when a site-specific navigation hook is unavailable.
        for (const method of ['pushState','replaceState']) {
            const original = history[method];
            if (typeof original !== 'function' || original.__tuWrapped) continue;
            const wrapped = function(...args) {
                const result = original.apply(this, args);
                queueMicrotask(routeChanged);
                return result;
            };
            wrapped.__tuWrapped = true;
            history[method] = wrapped;
        }

        window.addEventListener('resize', () => {
            discoverTop(); discoverRails(); scheduleMasonry();
        }, { passive:true });
        window.addEventListener('popstate', () => setTimeout(routeChanged, 0));
        window.addEventListener('pagehide', () => { if (state.interactionContextStore instanceof Map) flushInteractionContextStore(); }, { capture:true });
        try { if (typeof SITE.subscribeNavigation === 'function') SITE.subscribeNavigation(() => setTimeout(routeChanged, 0)); } catch {}

        if (settings.adaptivePerformance && 'PerformanceObserver' in window) {
            try {
                if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
                    state.longTaskObserver = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            state.longTaskCount += 1;
                            state.longTaskMs += entry.duration || 0;
                            state.lastLongTaskAt = performance.now();
                        }
                    });
                    state.longTaskObserver.observe({ type:'longtask', buffered:true });
                }
            } catch {}
        }
    }

    function fullRescan() {
        discoverTop();
        discoverRails();
        captureVisiblePosts();
        verifyRailClosed('left'); verifyRailClosed('right');
        if (settings.proactiveBuffer) ensureBuffer(adaptiveBufferTarget(3), 'manual');
    }

    function installKeyboard() {
        window.addEventListener('keydown', (event) => {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
            if (event.key === '[') { event.preventDefault(); toggleLeft(); }
            else if (event.key === ']') { event.preventDefault(); toggleRight(); }
            else if (event.key === '\\') { event.preventDefault(); toggleFocus(); }
            else if (event.key.toLowerCase() === 'u') { event.preventDefault(); state.shadow?.querySelector('[data-panel]')?.classList.toggle('open'); }
            else if (event.key.toLowerCase() === 'm') { event.preventDefault(); settings.layoutMode = settings.layoutMode === 'rows' ? 'masonry' : 'rows'; saveSettings(); applyColumns(); syncControls(); }
            else if (event.key.toLowerCase() === 'i') { event.preventDefault(); settings.mediaOnly = !settings.mediaOnly; saveSettings(); applyColumns(); syncControls(); }
            else if (/^[0-9]$/.test(event.key)) { event.preventDefault(); setColumns(event.key === '0' ? 'auto' : Number(event.key)); }
        }, true);
    }

    function extensionStatePayload(requestId = '', full = false, interactionResult = undefined) {
        // updateDiagnostics already returns a fresh snapshot with its own settings snapshot. Reuse
        // those exact objects for the one-shot bridge serialization instead of cloning both again.
        const diagnostics = updateDiagnostics(full);
        const payload = { requestId, version:VERSION, site:SITE_ID, siteLabel:SITE_LABEL, diagnostics, settings:diagnostics.settings };
        if (interactionResult !== undefined) payload.interactionResult = interactionResult;
        return payload;
    }

    function emitExtensionState(requestId = '', full = false, interactionResult = undefined) {
        try {
            document.dispatchEvent(new CustomEvent('ultradeck:state', { detail:JSON.stringify(extensionStatePayload(requestId, full, interactionResult)) }));
        } catch {}
    }

    function applyExternalSettings(next = {}) {
        const allowed = ['columns','minCardWidth','minCardHeight','maxColumns','gap','gutter','cardRadius','layoutMode','mediaOnly','leftOpen','rightOpen','focus','compact','softRails','proactiveBuffer','turboMedia','liveInteraction','adaptivePerformance'];
        for (const key of allowed) {
            if (!(key in next)) continue;
            const value = next[key];
            if (key === 'columns') settings.columns = value === 'auto' ? 'auto' : clamp(Number(value) || 1, 1, settings.maxColumns);
            else if (key === 'minCardWidth') settings.minCardWidth = clamp(Number(value) || 320, 160, 720);
            else if (key === 'minCardHeight') settings.minCardHeight = clamp(Number(value) || 0, 0, 1600);
            else if (key === 'maxColumns') settings.maxColumns = clamp(Number(value) || 20, 1, MAX_COLUMNS);
            else if (key === 'gap') settings.gap = clamp(Number(value) || 0, 0, 80);
            else if (key === 'gutter') settings.gutter = clamp(Number(value) || 0, 0, 120);
            else if (key === 'cardRadius') settings.cardRadius = clamp(Number(value) || 0, 0, 40);
            else if (key === 'layoutMode') settings.layoutMode = value === 'rows' ? 'rows' : 'masonry';
            else settings[key] = Boolean(value);
        }
        if (settings.columns !== 'auto') settings.columns = clamp(Number(settings.columns) || 1, 1, settings.maxColumns);
        saveSettings();
        applyRail('left'); applyRail('right');
        verifyRailClosed('left'); verifyRailClosed('right');
        updateGeometry(); syncControls(); updateHud();
        if (settings.turboMedia) syncAllMedia();
    }

    function installExtensionBridge() {
        if (document.documentElement?.dataset?.tuExtensionBridge === VERSION) return;
        if (document.documentElement) document.documentElement.dataset.tuExtensionBridge = VERSION;
        document.addEventListener('ultradeck:command', (event) => {
            let message = null;
            try { message = JSON.parse(String(event?.detail || '{}')); } catch {}
            if (!message || typeof message !== 'object') return;
            const requestId = String(message.requestId || '');
            if (message.type === 'interactPost') {
                // Keep the ordinary popup/settings bridge strictly synchronous and allocation-light.
                // Only the one command that can require native-source resurrection enters the async
                // transaction lane, and only its response carries the interaction result payload.
                const value = message.value && typeof message.value === 'object' ? message.value : {};
                Promise.resolve(interactRetainedPost(value.id, value.action || 'like', value.options || {})).then((result) => {
                    state.lastInteractionResult = result;
                    emitExtensionState(requestId, false, result);
                }, (error) => {
                    state.interactionFailures += 1;
                    const result = { ok:false, id:String(value.id || ''), action:String(value.action || 'like'), error:String(error?.message || error || 'interaction-failed') };
                    state.lastInteractionResult = result;
                    emitExtensionState(requestId, false, result);
                });
                return;
            }
            try {
                if (message.type === 'setColumns') setColumns(message.value);
                else if (message.type === 'setSettings') applyExternalSettings(message.value || {});
                else if (message.type === 'toggleNav') toggleLeft();
                else if (message.type === 'toggleExtras') toggleRight();
                else if (message.type === 'toggleFocus') toggleFocus();
                else if (message.type === 'rescan') fullRescan();
                else if (message.type === 'rebalance') { rebuildColumns(true); scheduleGeometryAudit(40); }
                else if (message.type === 'syncMedia') syncAllMedia();
                else if (message.type === 'buffer') { const n = Number(message.value); ensureBuffer(state.cache.size + (Number.isFinite(n) ? Math.max(1, Math.ceil(n)) : 30), 'extension'); }
                else if (message.type !== 'getState') return;
            } finally {
                emitExtensionState(requestId, message.type === 'getState');
            }
        }, true);
        queueMicrotask(() => emitExtensionState('boot', false));
    }

    function exposeDiagnostics() {
        const publicApi = Object.freeze({
                version:VERSION,
                diagnostics:() => ({ ...updateDiagnostics(true) }),
                setColumns:(v) => { setColumns(v); return updateDiagnostics(false); },
                setSettings:(v) => { applyExternalSettings(v || {}); return updateDiagnostics(true); },
                buffer:(n=30) => { const value = Number(n); return ensureBuffer(state.cache.size + (Number.isFinite(value) ? Math.max(1, Math.ceil(value)) : 30), 'manual'); },
                toggleNav:() => { toggleLeft(); return updateDiagnostics(true); },
                toggleExtras:() => { toggleRight(); return updateDiagnostics(true); },
                rescan:() => { fullRescan(); return updateDiagnostics(true); },
                interact:(id, action = 'like', options = {}) => interactRetainedPost(id, action, options),
                controls:(id) => retainedControlDescriptors(state.cache.get(String(id || '').trim())),
                sourceMounted:(id) => Boolean(locateMountedSource(String(id || ''))),
                postInfo:(id) => { const record = state.cache.get(String(id || '')); return record ? { id:record.id, sequence:record.sequence, nativeScrollTop:record.nativeScrollTop, nativeDocumentY:record.nativeDocumentY, sourceMounted:Boolean(locateMountedSource(record.id)), interactionControls:record.interactionCapsule?.controls?.size || record.interactionMirrorCount || record.clone?.querySelectorAll?.(FULL_INTERACTIVE_SELECTOR)?.length || 0, interactionCapturedAt:record.interactionCapsule?.capturedAt || 0, contextControls:record.interactionContext?.controls?.size || savedInteractionContext(record)?.controls?.size || 0, contextUpdatedAt:record.interactionContext?.updatedAt || 0 } : null; },
                live:() => postId(closestSourcePost(state.actionStage?.actual)) || null,
                deactivateLive:() => { restoreActionStage(); return updateDiagnostics(true); },
                syncMedia:() => { syncAllMedia(); return updateDiagnostics(true); },
                audit:() => { auditGeometry(); return updateDiagnostics(true); },
        });
        Object.defineProperty(window, '__UltraDeck', { configurable:true, value:publicApi });
        // Preserve the v7 Tumblr diagnostic surface for existing automation and user tooling.
        if (SITE_ID === 'tumblr') Object.defineProperty(window, '__TumblrUltraWideDeck', { configurable:true, value:publicApi });
    }

    async function boot() {
        if (state.booted) return;
        state.booted = true;
        // Arm the first-capture task before mandatory synchronous boot work. The callback still cannot
        // run until this JavaScript task returns, so all shell/bridge/observer setup remains complete
        // before capture begins. Starting the timer here simply lets its minimum delay elapse while
        // UltraDeck performs work it had to do anyway instead of adding dead wait after boot.
        setTimeout(() => captureVisiblePosts(), 0);
        // Start from the adapter's conservative top baseline. Native chrome/rail geometry is measured
        // inside the first capture read phase, after the feed's unavoidable geometry pass and before
        // clone/rail writes. This avoids a separate full-document layout before capture can begin.
        injectStyle();
        createMirror();
        createHud();
        installKeyboard();
        installObservers();
        installExtensionBridge();
        exposeDiagnostics();
        if (siteCapability('tumblrCssMap')) warmCssMap().then(() => { refreshResponsiveCloneStyle(); discoverRails(); scheduleMasonry(); scheduleScan(0); });
        else { state.cssMapReady = true; refreshResponsiveCloneStyle(); }
        // Start immediately with structural fallbacks; Tumblr may additionally warm its semantic CSS map.
        // Compute the real deck slot width BEFORE cloning media so the first request is already the
        // correct responsive rendition instead of a wasteful one-column-size request.
        state.route = routeFingerprint();
        // The first capture was armed at boot entry so its task boundary remains intact without
        // paying an additional timer delay after mandatory setup has already completed.
        setTimeout(() => {
            captureVisiblePosts();
            // Empty/loading feeds may not have paid the capture geometry pass yet. Only those cases
            // need the recovery discovery here; a successful initial capture keeps this timer read-free.
            if (!state.topDiscoveryRuns) discoverTop();
            if (!state.railDiscoveryComplete) discoverRails(true);
            if (settings.proactiveBuffer) ensureBuffer(Math.max(adaptiveBufferTarget(), 32), 'boot');
            scheduleGeometryAudit(120);
        }, 500);
    }

    // Install at userscript document-start, not after boot. Capability gates ensure that
    // media work as soon as React inserts an image node, often hundreds of milliseconds before the
    // full multi-column deck has finished discovering rails and cloning the post.
    if (siteCapability('staticTumblrMediaPreconnects')) installStaticMediaPreconnects();
    installInstantMediaAttributeAccelerator();
    if (siteCapability('tumblrNpfMedia')) { installNpfMediaAccelerator(); installTumblrApiFetchAccelerator(); }
    installEarlyMediaAccelerator();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
