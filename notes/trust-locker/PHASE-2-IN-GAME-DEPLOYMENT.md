# Barter Box Phase 2 Utopia Migration

This is the canonical migration checklist for moving Barter Box from localnet proof into Utopia public hardening and owned-unit in-game cutover.

GitHub + Cloudflare Pages is the primary deployment path. Vercel remains a secondary fallback if needed. Any static-SPA host is acceptable if it preserves the same URL/query contract.

## Hosting Contract

- Hosted app base URL: `https://<your-host>/`
- Full-detail browser mode: `https://<your-host>/?view=full`
- In-game browser mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=in-game`
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

## Runtime Assumptions

- `tenant` and `itemId` are runtime world-context inputs.
- `view` is presentation-only and may be toggled without losing the world context.
- The hosted app is the same codebase used in standalone browser and in-game browser contexts.
- The local demo signer is localnet-only and must not be exposed as a hosted Utopia assumption.
- No deployment-time secrets are required for the hosted frontend path today.

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
- Validate `?tenant=utopia&itemId=...&view=in-game` with EVE Vault on Utopia.
- Confirm the app resolves:
  - assembly identity
  - inventory
  - policy
  - trade preview
  - owner/visitor role detection
- Keep hosted/Utopia routes free of local demo signer controls.
- If writes fail in Utopia, record the exact failure and keep Stage B as read-only plus context validation until fixed.

### Stage C: Owned Utopia Cutover

- Obtain or control a real Utopia storage unit.
- Confirm you can edit the unit’s custom URL.
- Point the custom URL at the hosted Barter Box app with `view=in-game`.
- Validate the in-game `F` interaction opens the hosted app.
- Confirm owner-specific controls appear only for owner-capable accounts.
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
- [ ] Confirm `?view=in-game` renders the compact in-game mode.
- [ ] Confirm query parameters survive reloads and mode toggles.
- [ ] Confirm the hosted app serves as a single codebase for both browser and in-game use.
- [ ] Confirm the final in-game UI is still treated as work in progress until the remaining polish pass is complete.

### Browser Validation

- [ ] Confirm the external browser path opens a real Utopia object with `?tenant=utopia&itemId=...`.
- [ ] Confirm EVE Vault connects cleanly for Utopia validation.
- [ ] Confirm the app resolves the assembly context from a real `itemId`.
- [ ] Confirm the UI does not expose localnet-only demo signer controls in in-game mode.

### Utopia Cutover

- [ ] Obtain or control a real Utopia storage unit.
- [ ] Confirm you have permission to edit that unit’s custom URL.
- [ ] Set the custom URL to the hosted Barter Box app.
- [ ] Use the in-game `F` interaction to open the hosted app from the unit.
- [ ] Confirm the in-game browser lands in `view=in-game` by default.
- [ ] Capture the final hosted URL and cutover proof for submission.

### Cutover Preconditions

- [ ] Hosted URL is stable and public.
- [ ] The app is already verified in standalone browser mode.
- [ ] The app is already verified in the in-game browser on a controlled target.
- [ ] The chosen Utopia unit is owned or otherwise editable.
- [ ] The submission narrative stays honest about whether the cutover is read-only or writable.
