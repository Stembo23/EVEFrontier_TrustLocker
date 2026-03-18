# Trust Locker Phase 2 In-Game Deployment

This is the canonical hosting and in-game cutover checklist for Trust Locker.

The host does not have to be Vercel. Any static-SPA host is acceptable if it preserves the same URL/query contract. GitHub + Cloudflare Pages/Workers is a valid path.

## Hosting Contract

- Hosted app base URL: `https://<your-host>/`
- Full-detail browser mode: `https://<your-host>/?view=full`
- In-game browser mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=in-game`
- Localnet browser proof: `http://127.0.0.1:4179/?view=full`
- The chosen host should serve the app as a static SPA with rewrite-to-index behavior.

## Runtime Assumptions

- `tenant` and `itemId` are runtime world-context inputs.
- `view` is presentation-only and may be toggled without losing the world context.
- The hosted app is the same codebase used in standalone browser and in-game browser contexts.
- The local demo signer is localnet-only and must not be exposed as a hosted Utopia assumption.
- No deployment-time secrets are required for the hosted frontend path today.

## Optional Vercel Deployment Commands

From `apps/utopia-smart-assembly`:

1. `pnpm build`
2. `pnpm deploy:vercel:preview`
3. Validate the preview URL in a normal browser.
4. `pnpm deploy:vercel:prod`

If you prefer the manual Vercel CLI sequence:

1. `pnpm dlx vercel@latest login`
2. `pnpm dlx vercel@latest link`
3. `pnpm dlx vercel@latest deploy --prebuilt`
4. `pnpm dlx vercel@latest deploy --prebuilt --prod`

## Phase 2 In-Game Deployment Checklist

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
- [ ] Confirm EVE Vault connects cleanly for testnet/Utopia validation.
- [ ] Confirm the app resolves the assembly context from a real `itemId`.
- [ ] Confirm the UI does not expose localnet-only demo signer controls in in-game mode.

### Utopia Cutover

- [ ] Obtain or control a real Utopia storage unit.
- [ ] Confirm you have permission to edit that unit’s custom URL.
- [ ] Set the custom URL to the hosted Trust Locker app.
- [ ] Use the in-game `F` interaction to open the hosted app from the unit.
- [ ] Confirm the in-game browser lands in `view=in-game` by default.
- [ ] Capture the final hosted URL and cutover proof for submission.

### Cutover Preconditions

- [ ] Hosted URL is stable and public.
- [ ] The app is already verified in standalone browser mode.
- [ ] The app is already verified in the in-game browser on a controlled target.
- [ ] The chosen Utopia unit is owned or otherwise editable.
- [ ] The submission narrative stays honest about whether the cutover is read-only or writable.
