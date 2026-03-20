# Barter Box Status

## Current State

- Product name is now `Barter Box`; package and module identifiers remain `trust_locker` for stability.
- World-global player trade reputation remains deferred to v2.
- The localnet execution path is now working end to end for the core MVP loop.
- Utopia is now treated as the public testnet target, not as a separate post-localnet stage.
- The browser dApp now has real owner policy update/freeze actions and visitor trade execution wired through both:
  - the normal wallet transaction layer
  - a gated unsafe local-only demo signer path for localnet proof
- `pnpm build` passes at head.
- Browser cooldown blocking is now verified through explicit UI lock state and countdown behavior, not just transaction history.
- Phase 2 is now active:
  - Utopia public hardening
  - owned Utopia cutover
  - in-game integration milestone
  - three-view UI
  - shared strike persistence
  - owner-incentive market modes and owner reserve semantics
  - dual audit gate
- The hosted URL contract is documented and aligned to the current hosted-SPA setup:
  - `?view=full` for judge/debug mode
  - `?tenant=utopia&itemId=...&view=owner` for the owner setup contract
  - `?tenant=utopia&itemId=...&view=visitor` for the in-game browser contract
- The hosting lane is now Cloudflare-first:
  - GitHub + Cloudflare Pages is the primary static-SPA path
  - `apps/utopia-smart-assembly/public/_redirects` provides SPA fallback
  - `pnpm deploy:cloudflare:preview` and `pnpm deploy:cloudflare:prod` exist for the primary host
  - Vercel remains optional, not required
- Fuel-fee support is still a deferred dependency:
  - the current repo evidence does not prove a visitor-side Fuel debit and owner-controlled credit path
  - the owner-incentive fallback is the documented `perpetual_market` / `procurement_market` split
  - procurement mode uses the same storage unit's owner reserve for visitor-offered receipts
- Launch-readiness clarification is now active:
  - `perpetual_market` must hide the owner-claim panel
  - `procurement_market` must show `Claimable by owner`
  - discovery must hand off directly into live `view=visitor` / `view=owner` URLs
  - hosted Utopia is only `owner-ready` after stock/claim workflow is integrated or explicitly blocked by the platform

## Implemented

- Repo-level agent contract in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- Move package and tests in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension`
- Local dApp shell and data-provider boundary in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly`
- Barter Box localnet script suite in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/scripts/trust-locker`
- Authoritative operator runbook in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/OPERATOR-RUNBOOK.md`
- Submission proof matrix in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/SUBMISSION-PROOF-MATRIX.md`
- Browser-side localnet runtime with live policy, inventory, signal, and mutation support in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/src`
- Local-only demo signer path in the browser dApp for owner/visitor localnet proof without a wallet extension custom-RPC dependency
- Three-view browser UI:
  - `view=full` for judge/debug/proof surfaces
  - `view=owner` for guided setup/control
  - `view=visitor` for compact player-facing assembly interaction
- Visitor mode is now intentionally transaction-first:
  - assembly identity
  - shelf inventory
  - visitor hold
  - points / quantity / volume
  - cooldown / network penalty state
  - trade execution
- Owner governance remains in `view=owner` rather than the default visitor surface
- Shared strike persistence in the Move package and browser app:
  - owner-defined `strike_scope_id`
  - opt-in `use_shared_penalties`
  - shared strike-network pricing surcharge
  - shared network lockout across lockers in the same scope
- Owner incentive mode is documented and staged:
  - `perpetual_market` preserves the circulation model
  - `procurement_market` routes receipts into owner reserve
  - Fuel fees remain deferred unless a real payment path is proven
- Browser owner flow for shared strike-network policy mutation
- Browser-side Utopia object-discovery panel that:
  - loads owned objects from a connected wallet
  - queries public Utopia storage units, gates, and network nodes directly
  - surfaces candidate `item_id` values plus direct `Open in Visitor` / `Open in Owner` handoff actions
- Phase 2 Utopia migration and in-game deployment checklist are documented in:
  - `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md`
- Cloudflare Pages deployment scripts now exist in:
  - `pnpm deploy:cloudflare:preview`
  - `pnpm deploy:cloudflare:prod`
- New visitor funding script:
  - `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/scripts/trust-locker/seed-visitor-inventory.ts`

## Verified

- `sui move test` passes with 13 tests.
- `pnpm build` passes at head.
- `pnpm locker:set-strike-network --dry-run` works.
- `resolveLocalnetLockerSnapshot()` now resolves real localnet policy, inventory, and recent signal data without falling back to demo values.
- `pnpm demo:reset` works.
- `pnpm demo:prepare --dry-run` works.
- `pnpm demo:verify --dry-run` works.
- `pnpm demo:script` works.
- Localnet world was rebuilt after regenesis and Barter Box was republished against the live world package.
- Localnet owner flow succeeds:
  - extension authorization
  - locker policy configuration
  - open inventory seed
- Localnet visitor flow succeeds:
  - visitor owned inventory funding
  - fair trade
  - dishonest trade
- Local rival-pricing proof succeeds:
  - visitor tribe updated to rival bucket
  - live inspect shows `Visitor bucket: rival`
  - quoted requested points moved from friendly `9` to rival `15`
- Utopia public-object discovery succeeds without requiring owned objects:
  - `itemId 1000000016965` resolves to Utopia storage-unit object `0x01fea0bcbce309004a1e8dfb85c1243c3289e1797e388360ca0bc5cddb4de1b0`
  - `itemId 1000000016389` resolves to Utopia storage-unit object `0x0f1cecc5d71645ad8f7c1cba999ed044d8b10f3eeefc4009ded28322539d6028`
  - `itemId 1000000015336` resolves to Utopia storage-unit object `0x1c7ea03a0c59c7bbe53037431bdda350c9c571a518741f087cbf76a1fc8c9be8`
  - preferred public validation URL: `https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000015336`
- Utopia context resolution succeeds in a human browser pass with EVE Vault:
  - tenant + itemId + EVE Vault load a real assembly context
  - the sampled public object's behavior panel returned `DEPLOYMENT_NOT_FOUND`, so Phase 2 must keep Utopia claims precise until we control an owned unit
- External auditor deterministic Move scan completes with `0` findings, but the gate remains open because:
  - the prover stage fails in the auditor pipeline
  - the auditor CLI is Move-package oriented and does not scan the browser app directly
  - offchain/browser review still depends on internal audit plus manual review artifacts

## Important Fixes Landed

- Correct localnet package publishing now uses `sui client test-publish --build-env testnet --pubfile-path ...` so Barter Box links against the live world package instead of republishing `world` into the extension package.
- Owner-cap borrowing now uses `Receiving` refs instead of plain object refs.
- Local demo actor mapping is corrected:
  - locker owner = `frontier-character-a` / `PLAYER_A`
  - visitor = `frontier-character-b` / `PLAYER_B`
- Visitor inventory funding is now covered by a sponsored world transaction path.
- Default policy configuration now deduplicates accepted `type_id`s.
- The script layer now runs through `node --import tsx`, avoiding the previous `tsx` IPC issue in constrained environments.
- The localnet live reader now uses a valid zero-padded sender address for `devInspect`, which fixed the earlier fallback bug.
- The browser dApp now persists owner/visitor local demo signer secrets in session storage and routes localnet owner/trade actions through an in-browser ED25519 signer built from `suiprivkey...` values.
- The top-right connect button is now treated as the real-wallet path, while localnet write proof uses the explicit `Local Demo Signer` card.
- The trade panel now exposes cooldown blocking as an explicit lock state with a visible reason and disabled action button, rather than relying on the timer alone.
- The browser dApp can now query owned objects for a connected EVE Vault/testnet wallet and surface candidate Utopia `item_id` values directly in the UI.
- Browser `Save policy` now passes the final shared-penalty fields into Move:
  - `strike_scope_id`
  - `use_shared_penalties`
- Browser owner actions now include `set_strike_network_policy`.
- Inspect and script layers now include shared strike-network support.
- The unsafe local demo signer panel is now hidden entirely outside localnet full-detail mode.

## Remaining Gaps

- Final visual polish is still open. The app now has a darker EVE-style panel treatment and a more game-like visitor/owner information layout, but it still needs a stronger asset/icon pass before calling those views finished.
- Owner-incentive implementation is still open in code, but the docs now define the intended market-mode split and the Fuel-fee no-go result so the product story stays honest.
- Hosted deployment and in-game custom URL cutover are documented and ready for a real Utopia storage-unit handoff.
- Hosted Utopia now has two readiness stages:
  - `browser read-ready`
  - `browser owner-ready`
- Phase 2 audit gate is partially complete:
  - internal review is documented
  - external deterministic Move scan is documented
  - prover-stage failure is still open
  - offchain external scan is not available from the current auditor CLI because it expects a Move manifest
- Utopia migration still has one remaining live ownership milestone:
  - point a real owned Utopia storage unit at the hosted Barter Box app and validate `F` opening the in-game browser
- Owned Utopia storage-unit cutover is still pending user-side control/permissions.
- Owner stock/claim UX remains a launch blocker:
  - policy is handled in the Barter Box UI
  - stock/claim still rely on storage-unit inventory flow
  - owned-Utopia cutover should not be called owner-ready until wallet-backed stock/claim is implemented or a platform limitation is documented
- Final visitor and owner visual polish is still open and should stay treated as WIP until the next asset pass.

## Deferred v2

- World-global player trade reputation carried by character across all lockers
- Final product naming and brand alignment once the mechanic is stable
