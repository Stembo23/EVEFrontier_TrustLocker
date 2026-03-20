# Barter Box Phase 2 Utopia Migration

This is the canonical migration checklist for moving Barter Box from localnet proof into Utopia public hardening and owned-unit in-game cutover.

Use [`LAUNCH-ROADMAP.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/LAUNCH-ROADMAP.md) as the stage-by-stage release gate. This document remains the deployment and cutover checklist.

GitHub + Cloudflare Pages is the primary deployment path. Vercel remains a secondary fallback if needed. Any static-SPA host is acceptable if it preserves the same URL/query contract.

## Hosting Contract

- Hosted app base URL: `https://<your-host>/`
- Full-detail browser mode: `https://<your-host>/?view=full`
- Owner browser mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=owner`
- Visitor browser mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=visitor`
- Localnet browser proof: `http://127.0.0.1:4179/?view=full`
- The chosen host should serve the app as a static SPA with rewrite-to-index behavior.
- For Cloudflare Pages, the SPA fallback comes from `apps/utopia-smart-assembly/public/_redirects`.

## Cloudflare Pages Deployment Commands

From `apps/utopia-smart-assembly`:

1. `pnpm build`
2. `pnpm deploy:cloudflare:preview`
3. Validate the preview URL in a normal browser.
4. `pnpm deploy:cloudflare:prod`

If you prefer GitHub-connected Cloudflare Pages instead of CLI deploys, configure the Pages project to:

1. Use the repository root as the source.
2. Run `cd apps/utopia-smart-assembly && pnpm build`.
3. Publish `apps/utopia-smart-assembly/dist`.
4. Keep `apps/utopia-smart-assembly/public/_redirects` in place for SPA fallback.
5. Set these Pages environment variables for live hosted Utopia reads and writes:
   - `VITE_BARTER_BOX_PACKAGE_ID`
   - `VITE_BARTER_BOX_EXTENSION_CONFIG_ID`
   - optional: `VITE_EVE_WORLD_PACKAGE_ID`
   - optional: `VITE_SUI_RPC_URL`

## Runtime Assumptions

- `tenant` and `itemId` are runtime world-context inputs.
- `view` is presentation-only and may be toggled without losing the world context.
- The hosted app is the same codebase used in standalone browser and in-game browser contexts.
- The local demo signer is localnet-only and must not be exposed as a hosted Utopia assumption.
- No deployment-time secrets are required for the hosted frontend path.
- Live hosted Utopia policy/inventory reads and wallet-backed writes require the Barter Box package/config env vars above.
- `view=owner` remains the guided setup/control surface, and future owner-incentive controls should live there rather than in `view=visitor`.
- `view=visitor` remains the player-facing trade surface.
- Fuel fees are currently deferred because the feasibility spike did not prove a character-side Fuel debit/credit path.
- The fallback owner-incentive design is a market-mode split:
  - `perpetual_market` for the current shelf-circulation behavior
  - `procurement_market` for visitor receipts that route into the same storage unit's owner reserve
- Owner launch-readiness now depends on explicit stock/claim handling:
  - `perpetual_market` hides the owner-claim panel
  - `procurement_market` shows `Claimable by owner`
  - owner testing is not complete until stock/claim flow is integrated or a platform limitation is documented
- Public Utopia object discovery is not enough for final proof:
  - public `itemId`s are valid for context resolution
  - final owner/visitor validation requires one controlled Utopia storage unit running Barter Box
- Identity and view gating assumptions are now explicit:
  - owner = current onchain owner/capability holder of the unit
  - in-game owner defaults to `owner`
  - in-game non-owner defaults to `visitor`
  - non-owner does not get the owner toggle in-game
  - multiple-character wallets require explicit character selection before live writes

## Migration Stages

### Stage A: Localnet Parity Freeze

- Freeze localnet feature scope before Utopia migration.
- Keep localnet focused on:
  - policy mutation
  - visitor trade flow
  - shared strike persistence
  - cooldown and shared lockout behavior
- Do not add new product features unless they are required for Utopia compatibility or deployment correctness.

### Stage B: Utopia Public Hardening

- Deploy the browser app to a stable HTTPS host.
- Validate `?view=full` in a normal browser.
- Validate `?tenant=utopia&itemId=...&view=owner` and `?tenant=utopia&itemId=...&view=visitor` with EVE Vault on Utopia.
- Confirm the app resolves:
  - assembly identity
  - inventory
  - policy
  - trade preview
  - owner/visitor role detection
- Confirm the hosted app is using the explicit Utopia runtime path rather than localnet/demo fallback.
- Keep the owner-incentive narrative explicit:
  - public docs should state whether the active market mode is `perpetual_market` or `procurement_market`
  - public docs should state that Fuel fees are deferred until the payment path is proven
- Keep hosted/Utopia routes free of local demo signer controls.
- Treat this stage as `browser read-ready` until:
  - discovery can hand off directly into live owner/visitor URLs
  - a real `itemId` is being used in the hosted route
- Do not treat public-object discovery as launch proof by itself; it only proves hosted object-context resolution.
- If writes fail in Utopia, record the exact failure and keep Stage B as read-only plus context validation until fixed.
- Do not call this stage `browser owner-ready` until all of the following succeed on hosted Utopia:
  - owner policy write
  - `Stock shelf`
  - `Claim receipts` or `Restock from claimable` when procurement state exists
  - visitor trade after the owner inventory actions
- Owner inventory validation now assumes the in-panel `Inventory` tab flow:
  - `Items you are offering for trade`
  - `Offered on shelf`
  - `Claimable by owner` in procurement mode

### Stage C: Owned Utopia Cutover

- Obtain or control a real Utopia storage unit.
- Confirm the unit is the exact unit used for hosted owner-ready validation, not just a random public object.
- Confirm you can edit the unit’s custom URL.
- Point the custom URL at the hosted Barter Box app with `view=visitor`.
- If the owner-flow includes market-mode setup, keep that in `view=owner` and document it separately from the in-game visitor path.
- Validate the in-game `F` interaction opens the hosted app.
- Confirm owner-specific controls appear only for owner-capable accounts.
- Confirm owner opens into `owner` by default and can still switch to `visitor`.
- Confirm non-owner opens into `visitor` and does not see the owner toggle.
- Treat this as the real in-game integration milestone.

### Stage D: Post-Cutover Hardening

- Verify owner stock/seed behavior on the owned unit.
- Verify visitor fair trade, underpay trade, and cooldown lock behavior.
- If a second owned locker exists in the same strike network, verify shared strike persistence across both.
- Capture the final hosted URL and cutover proof for submission.

## In-Game Integration Checklist

### Hosted App

- [ ] Deploy the app to a stable HTTPS host.
- [ ] Confirm the root URL loads without a trailing slash requirement.
- [ ] Confirm `?view=full` renders the full-detail mode.
- [ ] Confirm `?view=owner` renders the guided owner mode.
- [ ] Confirm `?view=visitor` renders the compact visitor mode.
- [ ] Confirm query parameters survive reloads and mode toggles.
- [ ] Confirm the hosted app serves as a single codebase for both browser and in-game use.
- [ ] Confirm the final visitor and owner UI is still treated as work in progress until the remaining polish pass is complete.

### Browser Validation

- [ ] Confirm the external browser path opens a real Utopia object with `?tenant=utopia&itemId=...&view=full`.
- [ ] Confirm EVE Vault connects cleanly for Utopia validation.
- [ ] Confirm the app resolves the assembly context from a real `itemId`.
- [ ] Confirm the app records the assembly owner character correctly from smart-object context.
- [ ] Confirm a single wallet character auto-selects correctly.
- [ ] Confirm multiple wallet characters require explicit selection before writes.
- [ ] Confirm the Cloudflare Pages env vars for the Barter Box package/config are set.
- [ ] Confirm the UI does not expose localnet-only demo signer controls in owner or visitor mode.
- [ ] Confirm `Load public Utopia objects` offers direct `Open in Visitor` / `Open in Owner` handoff actions.
- [ ] Confirm hosted owner/visitor routes stop showing the generic missing-`itemId` state after discovery handoff.
- [ ] Confirm `perpetual_market` hides `Claimable by owner`.
- [ ] Confirm `procurement_market` shows `Claimable by owner`.
- [ ] Confirm `Inventory` is present in `view=owner`.
- [ ] Confirm `Stock shelf` succeeds from `Items you are offering for trade`.
- [ ] Confirm `Claim receipts` or `Restock from claimable` succeeds in procurement mode.
- [ ] Confirm owner-ready is not claimed until those inventory actions are validated live.
- [ ] Confirm the chosen validation unit is a controlled Barter Box-enabled Utopia storage unit, not just a public context sample.
- [ ] Confirm owner and visitor inventories on that unit are populated enough to exercise the live flows.
- [ ] Record the selected wallet character ID used for each owner and visitor proof step.

### Utopia Cutover

- [ ] Obtain or control a real Utopia storage unit.
- [ ] Confirm you have permission to edit that unit’s custom URL.
- [ ] Set the custom URL to the hosted Barter Box app.
- [ ] Use the in-game `F` interaction to open the hosted app from the unit.
- [ ] Confirm the in-game browser lands in `owner` for the onchain owner.
- [ ] Confirm the in-game browser lands in `visitor` for a non-owner.
- [ ] Confirm non-owner does not get the owner toggle.
- [ ] Capture the final hosted URL and cutover proof for submission.

### Cutover Preconditions

- [ ] Hosted URL is stable and public.
- [ ] The app is already verified in standalone browser mode.
- [ ] The app is already verified as `browser owner-ready` on the same controlled Utopia unit.
- [ ] The app is already verified in the in-game browser on a controlled target.
- [ ] The chosen Utopia unit is owned or otherwise editable.
- [ ] The submission narrative stays honest about whether the cutover is read-only or writable.
