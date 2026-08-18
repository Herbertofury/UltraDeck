    // Cross-site geometry hardening. Site adapters may define a conservative maximum deck top.
    // This prevents route-control wrappers and SPA placeholders from creating a large dead band
    // between site chrome and the first UltraDeck row while preserving the normal discovery path.
    const hardeningBaseResolveDeckTop = resolveDeckTop;
    resolveDeckTop = function resolveDeckTopHardened() {
        const discovered = hardeningBaseResolveDeckTop();
        const configured = Number(SITE.maxDeckTop);
        if (!Number.isFinite(configured) || configured <= 0) return discovered;
        const cap = clamp(Math.round(configured), 72, 260);
        if (state.top > cap) {
            state.top = cap;
            state.topAnchorSource = `${state.topAnchorSource || 'chrome'}+site-cap`;
            state.topAnchorReflows += 1;
        }
        return state.top;
    };
