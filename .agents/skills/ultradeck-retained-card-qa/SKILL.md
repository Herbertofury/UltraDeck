---
name: ultradeck-retained-card-qa
description: Implement and verify UltraDeck site adapters and retained-card interactions across portable userscripts and Chromium/Firefox extensions, without confusing fixture checks with authenticated native acceptance.
---

# UltraDeck retained-card QA

Use repository-root paths below. Read AGENTS.md first; this is local workflow knowledge, not a replacement for the pinned shared core.

## Find the actual owner before changing code

Read package.json and .github/workflows/verify.yml for current versions and commands. INSTALL-OPTIONS.md may describe an older release; do not copy its version into a new build. Trace the affected behavior through shared-runtime-source/ and the relevant src/adapters/ source. Check shared-runtime-source/build_runtime.py and scripts/build_portable.py to distinguish generated outputs from maintained input. Make the smallest source-level change; do not patch only an emitted runtime or userscript.

Keep adapters independently enabled. Extension Enabled Sites switches do not govern standalone userscripts: verify each packaging mode's actual contract rather than declaring one switch universal. A fix for one site must not make unrelated adapters dependent on it.

## Reproduce without losing retained content

Record the site, browser/version, package mode, exact commit and loaded manifest/runtime identity. Separate these levels:
- local synthetic fixture;
- public upstream page;
- authenticated authorized page;
- player loaded/ready;
- media actually playing after user action.

For a recycled source post, exercise the retained card before and after source recycling, navigation away/back, and same-tab reload. Check actionable native controls, reply drafts, expanded threads, menus, polls/selections, details-open state, and per-post context. Exercise cancel/close and repeated actions. Verify the intended post receives the action, not a recycled neighbor.

Observe failed-player recovery alongside healthy players. A targeted retry must not reload every player or lose current context. Respect autoplay settings. Never acquire or publish private account fixtures, credentials or paywalled media merely to increase test coverage.

## Run the real regression path

Use the current verify workflow as authoritative, including its setup and browser environment. Its established sequence includes:
1. Generate shared runtime with `python3 shared-runtime-source/build_runtime.py`.
2. Run `npm run typecheck`, `npm run build` and `npm run build:firefox`.
3. Generate portable output with `python3 scripts/build_portable.py`.
4. Run static contracts `python3 tests/test_site_regression_contract.py` and `python3 tests/test_surround_contract.py`.
5. Run browser coverage in `tests/verify_surround_browser.py`, `tests/verify_site_visuals.py` and `tests/test_v85_site_options.py` with the workflow's Chromium path, headed/Xvfb setup and current ULTRADECK_EXPECT_VERSION.
6. Run remaining syntax, manifest and archive checks in verify.yml, then inspect generated changes. Keep unrelated pre-existing generation drift out of the patch.

Do not blindly install dependencies or change security settings if the environment lacks prerequisites. Report precisely which stage cannot run. A passing static contract does not establish native behavior, and the legacy test filename does not determine the current package version.

## Performance and delivery evidence

Compare equivalent retained-card datasets and actions, including long-session input/scroll latency and memory. Preserve full mounted, actionable retention and media quality. Do not obtain speed by culling cards, hiding posts, disabling off-screen controls or reducing the workload.

Attach bounded evidence with the exact source and loaded build identity, retention count, interaction sequence, measured latency/memory, failures and recovery outcome. Preserve last-good data and distinguish not-run checks from passes. Verify remote commit and its CI separately from local tests, and installed/loaded assets separately from publication. Keep screenshots and fixtures non-sensitive; if native access is unavailable, state that acceptance remains unverified.
