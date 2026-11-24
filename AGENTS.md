# Repository instructions

Read `.agents/foundry/AGENTS-adapter.md` for the pinned shared engineering core.
Keep this file and nested instructions project-owned: setup, commands, constraints and acceptance belong here.

## UltraDeck-local contract

- Read README.md, docs/INSTALL-OPTIONS.md, package.json and .github/workflows/verify.yml before implementation. Respect the package and manifest versions; historical README/release claims are not proof of the current build.
- Preserve the lossless retention contract: mounted, actionable retained cards; no viewport culling, quantity caps, hidden posts, reduced media quality or disabled off-screen controls to obtain speed.
- Keep site adapters independently enabled/disabled. Native actions, per-post context and failed-player recovery must respect each upstream site's actual behavior; never claim authenticated live-site acceptance from fixtures or browser smoke tests.
- Shared runtime source and site adapters are source of truth; generate portable/extension artifacts with the documented scripts, not output-only patches. Use package.json scripts for typecheck and Chromium/Firefox builds; verify.yml defines the current regression/browser acceptance sequence.
- Protect stored drafts/settings and last-good media context. Never publish credentials, session state, paywalled fixtures or private account content. No new permissions or persistent authentication grants are implied by this guidance.
- Compare equivalent full-retention workloads before promoting performance changes. Keep browser-version, fixture versus live-site, and actually-playing versus player-ready evidence separate.

## Mandatory pre-release optimization gate

Before finalizing every release, follow the owner-mandated [Athena zero-loss pre-release optimization standard](https://github.com/Herbertofury/Athena/blob/main/guidance/PRE_RELEASE_OPTIMIZATION.md). Evaluate shrink-anything, fast-anything and rust-anything using reviewed pinned tools in isolated worktrees; run applicable passes, compare equivalent complete workloads, keep only independently verified improvements, restore rejected changes, and record per-tool evidence or explicit inapplicability/blockers. Never weaken tests, delete required content, force a Rust rewrite or regress functionality, quality, portability, compatibility, security or protected performance metrics. Data/documentation-only releases and existing native Rust paths require honest applicability decisions, not artificial ports. Existing local and pinned governance requirements remain intact.
