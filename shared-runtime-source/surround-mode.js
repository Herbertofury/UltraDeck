    // Optional Surround mode: keep the site's native center feed visible and fully interactive while
    // UltraDeck retains the same lossless cards in adaptive left/right deck lanes. It is deliberately
    // off by default and changes presentation only; capture, media, interaction capsules, buffering,
    // TikTok recovery, and the no-culling contract continue to use the existing runtime.
    const SURROUND_MIN_SIDE = 184;
    const SURROUND_MAX_SIDE = 430;
    const SURROUND_MIN_CENTER = 440;
    const SURROUND_MAX_CENTER = 760;

    function surroundEnabled() { return Boolean(settings.surroundMode); }

    function surroundGeometry() {
        const viewport = Math.max(640, Number(innerWidth) || 1280);
        const gap = clamp(Number(settings.gap) || 16, 8, 36);
        let center = clamp(Math.round(viewport * (viewport >= 1500 ? .44 : .50)), SURROUND_MIN_CENTER, SURROUND_MAX_CENTER);
        let side = Math.floor((viewport - center - gap * 4) / 2);
        if (side < SURROUND_MIN_SIDE) {
            center = clamp(viewport - (SURROUND_MIN_SIDE * 2) - gap * 4, 360, SURROUND_MAX_CENTER);
            side = Math.max(150, Math.floor((viewport - center - gap * 4) / 2));
        }
        side = clamp(side, 150, SURROUND_MAX_SIDE);
        return { center, side, gap };
    }

    function applySurroundVisualState(refreshLayout = true) {
        const enabled = surroundEnabled();
        const root = document.documentElement;
        if (root) root.dataset.tuSurround = enabled ? '1' : '0';
        if (state.shell) state.shell.dataset.tuSurround = enabled ? '1' : '0';
        if (enabled && state.shell) {
            const geometry = surroundGeometry();
            state.shell.style.setProperty('--tu-surround-center', `${geometry.center}px`);
            state.shell.style.setProperty('--tu-surround-side', `${geometry.side}px`);
            state.shell.style.setProperty('--tu-surround-gap', `${geometry.gap}px`);
        }
        if (refreshLayout && state.shell?.isConnected) {
            updateGeometry();
            scheduleGeometryAudit(70);
            updateHud();
        }
        return enabled;
    }

    function setSurroundMode(enabled, persist = true) {
        const next = Boolean(enabled);
        if (settings.surroundMode === next && document.documentElement?.dataset?.tuSurround === (next ? '1' : '0')) return next;
        settings.surroundMode = next;
        if (persist) saveSettings();
        applySurroundVisualState(true);
        return next;
    }

    const surroundBaseInjectStyle = injectStyle;
    injectStyle = function injectStyleWithSurround() {
        surroundBaseInjectStyle();
        if (document.getElementById(`${ID}-surround-style`)) return;
        const style = document.createElement('style');
        style.id = `${ID}-surround-style`;
        style.textContent = `
            html[data-tu-surround="1"] [data-tu-native-source="1"] {
                visibility:visible !important;
                pointer-events:auto !important;
            }
            html[data-tu-surround="1"] #${ID}-shell {
                left:0 !important;
                right:0 !important;
                padding-left:var(--tu-surround-gap,16px) !important;
                padding-right:var(--tu-surround-gap,16px) !important;
                background:transparent !important;
                pointer-events:none !important;
                scrollbar-width:none !important;
            }
            html[data-tu-surround="1"] #${ID}-shell::-webkit-scrollbar { width:0 !important; height:0 !important; }
            html[data-tu-surround="1"] #${ID}-grid {
                display:grid !important;
                grid-template-columns:var(--tu-surround-side,300px) minmax(0,var(--tu-surround-center,640px)) var(--tu-surround-side,300px) !important;
                column-gap:var(--tu-surround-gap,16px) !important;
                align-items:start !important;
                justify-content:center !important;
                width:100% !important;
                pointer-events:none !important;
            }
            html[data-tu-surround="1"] #${ID}-grid > .tu-column {
                width:100% !important;
                max-width:var(--tu-surround-side,300px) !important;
                min-width:0 !important;
                pointer-events:auto !important;
            }
            html[data-tu-surround="1"] #${ID}-grid > .tu-column:nth-child(1) { grid-column:1 !important; }
            html[data-tu-surround="1"] #${ID}-grid > .tu-column:nth-child(2) { grid-column:3 !important; }
            html[data-tu-surround="1"] #${ID}-grid > .tu-column:nth-child(n+3) { display:none !important; }
            html[data-tu-surround="1"] #${ID}-grid > .tu-item {
                width:var(--tu-surround-side,300px) !important;
                max-width:var(--tu-surround-side,300px) !important;
                pointer-events:auto !important;
            }
            html[data-tu-surround="1"] #${ID}-sentinel { pointer-events:none !important; }
            @media (max-width: 760px) {
                html[data-tu-surround="1"] #${ID}-shell { display:none !important; }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
        applySurroundVisualState(false);
    };

    const surroundBaseApplyColumns = applyColumns;
    applyColumns = function applyColumnsWithSurround(widthOverride = null) {
        if (!surroundEnabled()) return surroundBaseApplyColumns(widthOverride);
        const geometry = surroundGeometry();
        const originalColumns = settings.columns;
        const originalMaxColumns = settings.maxColumns;
        settings.columns = 2;
        settings.maxColumns = Math.max(2, Number(settings.maxColumns) || 2);
        try {
            surroundBaseApplyColumns(geometry.side * 2 + Math.max(0, Number(settings.gap) || 0));
            if (state.shell) {
                state.shell.dataset.tuSurround = '1';
                state.shell.style.setProperty('--tu-surround-center', `${geometry.center}px`);
                state.shell.style.setProperty('--tu-surround-side', `${geometry.side}px`);
                state.shell.style.setProperty('--tu-surround-gap', `${geometry.gap}px`);
            }
        } finally {
            settings.columns = originalColumns;
            settings.maxColumns = originalMaxColumns;
        }
    };

    const surroundBaseUpdateGeometry = updateGeometry;
    updateGeometry = function updateGeometryWithSurround() {
        if (!surroundEnabled()) return surroundBaseUpdateGeometry();
        if (!state.shell) return;
        const geometry = surroundGeometry();
        state.shell.style.setProperty('--tu-shell-left', '0px');
        state.shell.style.setProperty('--tu-shell-right', '0px');
        state.shell.style.setProperty('--tu-shell-top', `${state.top}px`);
        state.shell.style.setProperty('--tu-surround-center', `${geometry.center}px`);
        state.shell.style.setProperty('--tu-surround-side', `${geometry.side}px`);
        state.shell.style.setProperty('--tu-surround-gap', `${geometry.gap}px`);
        applyColumns(geometry.side * 2 + Math.max(0, Number(settings.gap) || 0));
        scheduleDeckMetrics(900);
    };

    const surroundBaseCreateMirror = createMirror;
    createMirror = function createMirrorWithSurround() {
        surroundBaseCreateMirror();
        applySurroundVisualState(false);
    };

    const surroundBaseCreateHud = createHud;
    createHud = function createHudWithSurround() {
        surroundBaseCreateHud();
        const sh = state.shadow;
        if (!sh || sh.querySelector('[data-surround-mode]')) return;
        const toggles = sh.querySelector('.toggles');
        if (!toggles) return;
        const button = document.createElement('button');
        button.className = 'toggle';
        button.type = 'button';
        button.dataset.surroundMode = '1';
        button.textContent = 'Surround mode';
        button.title = 'Keep the normal center feed and place retained UltraDeck cards around it';
        button.classList.toggle('on', surroundEnabled());
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSurroundMode(!surroundEnabled(), true);
            button.classList.toggle('on', surroundEnabled());
        });
        toggles.prepend(button);
    };

    const surroundBaseSyncControls = syncControls;
    syncControls = function syncControlsWithSurround() {
        surroundBaseSyncControls();
        state.shadow?.querySelector('[data-surround-mode]')?.classList.toggle('on', surroundEnabled());
    };

    const surroundBaseApplyExternalSettings = applyExternalSettings;
    applyExternalSettings = function applyExternalSettingsWithSurround(value = {}) {
        const incoming = value && typeof value === 'object' ? value : {};
        const hasSurround = Object.prototype.hasOwnProperty.call(incoming, 'surroundMode');
        const rest = { ...incoming };
        delete rest.surroundMode;
        const result = surroundBaseApplyExternalSettings(rest);
        if (hasSurround) setSurroundMode(Boolean(incoming.surroundMode), true);
        return result;
    };

    const surroundBaseUpdateDiagnostics = updateDiagnostics;
    updateDiagnostics = function updateDiagnosticsWithSurround(full = false) {
        const result = surroundBaseUpdateDiagnostics(full);
        if (state.diagnostics) {
            state.diagnostics.surroundMode = surroundEnabled();
            state.diagnostics.surroundCenterWidth = surroundEnabled() ? surroundGeometry().center : 0;
            state.diagnostics.surroundSideWidth = surroundEnabled() ? surroundGeometry().side : 0;
        }
        return state.diagnostics || result;
    };

    // Existing saved values are honored for userscripts. Extension builds overwrite this during the
    // isolated-world bridge restore using the current site's per-site preference.
    settings.surroundMode = Boolean(settings.surroundMode);
    applySurroundVisualState(false);
