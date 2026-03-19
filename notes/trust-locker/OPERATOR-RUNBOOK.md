# Barter Box Operator Runbook

This is the authoritative local/demo sequence for Barter Box. Use it as the source of truth for reset, prepare, and verify.

## Preconditions

- Source the workspace toolchain: [`notes/setup/codex-env.zsh`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/setup/codex-env.zsh)
- Work from [`apps/utopia-smart-assembly`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly)
- Use `SUI_NETWORK=localnet` for the local submission path
- Provide one of the supported signer pairs:
  - owner: `PLAYER_A_PRIVATE_KEY` or `LOCKER_OWNER_PRIVATE_KEY`
  - visitor: `PLAYER_B_PRIVATE_KEY` or `LOCKER_VISITOR_PRIVATE_KEY`
  - admin fallback where needed: `ADMIN_PRIVATE_KEY`
- Browser write proof on localnet now uses the unsafe local-only demo signer panel in the dApp:
  - paste owner key into the `Owner signer secret` field
  - paste visitor key into the `Visitor signer secret` field
  - save them to browser session storage
- Do not use EVE Vault for the localnet proof. Reserve EVE Vault for Utopia validation.
- The hosted deployment path is static and Cloudflare Pages-based:
  - `pnpm deploy:cloudflare:preview` for preview hosting
  - `pnpm deploy:cloudflare:prod` for production hosting
- Vercel remains optional, not primary.
- No deployment-time secrets are required for the hosted frontend path today.

## Reset / Prepare / Verify

1. `source /Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh`
2. `cd /Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly`
3. `pnpm demo:reset`
4. `SUI_NETWORK=localnet pnpm demo:prepare`
5. `SUI_NETWORK=localnet pnpm demo:verify`
6. `pnpm build`

## Browser Proof Sequence (Localnet)

1. `pnpm dev`
2. Open `http://127.0.0.1:4179`
3. Use the `Local Demo Signer` card, not the wallet button:
   - paste `PLAYER_A_PRIVATE_KEY` into `Owner signer secret`
   - paste `PLAYER_B_PRIVATE_KEY` into `Visitor signer secret`
   - click `Save local signer secrets`
4. Confirm the signer card shows derived owner and visitor addresses instead of `Invalid secret`
5. In `Owner Governance`:
   - change one policy value
   - click `Save policy`
   - then click `Freeze locker`
6. In `Visitor Session + Trade`:
   - execute one fair trade
   - execute one dishonest trade
   - attempt one immediate follow-up trade to prove cooldown blocking
7. Capture screenshots and digests for:
   - owner save
   - owner freeze
   - fair trade
   - dishonest trade
   - cooldown block

## Expanded Operator Sequence

Use this only when you need the granular commands behind `prepare` and `verify`.

1. `pnpm print:locker-context`
2. `SUI_NETWORK=localnet pnpm locker:read-deployment`
3. `SUI_NETWORK=localnet pnpm locker:publish`
4. `SUI_NETWORK=localnet pnpm locker:authorize`
5. `SUI_NETWORK=localnet pnpm locker:configure`
6. `SUI_NETWORK=localnet pnpm locker:seed-open`
7. `SUI_NETWORK=localnet pnpm locker:seed-visitor`
8. `SUI_NETWORK=localnet pnpm locker:set-visitor-rival`
9. `SUI_NETWORK=localnet pnpm locker:set-strike-network --dry-run`
10. `SUI_NETWORK=localnet pnpm locker:trade-fair`
11. `SUI_NETWORK=localnet pnpm locker:trade-dishonest`
12. `SUI_NETWORK=localnet pnpm locker:inspect`
13. `SUI_NETWORK=localnet pnpm locker:signals`
14. `pnpm demo:script`

## Required Outputs

- `deployments/localnet/trust-locker.json` must exist and be consumed by scripts and UI
- `locker:inspect` must show the current policy, bucket, strike, cooldown, and quote behavior
- `locker:signals` must show recent policy/trade/penalty events
- The browser proof narrative must explicitly state that localnet uses the unsafe local-only demo signer because wallet-extension custom-RPC support was not reliable enough for the submission path
- The final demo script must state:
  - `Barter Box` is the product name
  - global player reputation is deferred to v2
  - Utopia live writes are stretch, not baseline

## Utopia Read-Only Validation

- Open the external-browser entry with `?tenant=utopia&itemId=...`
- Connect EVE Vault
- Confirm the assembly context loads and the locker/object identity is correct
- If you do not already have a live `itemId`, open the target object in the browser and copy the `itemId` value from the URL query string or the object header before starting this step
- Record the read-only result only
- Do not claim live Utopia writes unless they are separately proven

## Phase 2 In-Game Cutover

Use this only when you are ready to point a real storage unit at the hosted app.

1. Confirm the hosted app is deployed and reachable over HTTPS.
2. Confirm `?view=full` and `?view=in-game` both render correctly on the hosted URL.
3. Confirm the in-game browser opens the hosted app on a controlled assembly.
4. Confirm the in-game layout hides local demo signer and other proof-only controls.
5. Obtain a real Utopia storage unit that you own or can edit.
6. Set that unit’s custom URL to the hosted Barter Box app.
7. Open the unit in-game with `F`.
8. Confirm the hosted app loads in the in-game browser with the expected `itemId`.
9. Capture the final hosted URL, unit identity, and screenshot proof.

### Deployment Commands

From [`apps/utopia-smart-assembly`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly):

1. `pnpm build`
2. `pnpm deploy:cloudflare:preview`
3. Validate the preview URL in a normal browser.
4. `pnpm deploy:cloudflare:prod`

If you need the optional Vercel fallback flow, follow [`PHASE-2-IN-GAME-DEPLOYMENT.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md).
