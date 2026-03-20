# Barter Box Workspace

`Barter Box` is the product name. Keep code/package semantics stable; `trust_locker` identifiers remain in place until a deliberate contract rename.

This workspace contains the project-owned code for the Barter Box Smart Assembly Phase 2 build.

## Scope

- `move-contracts/trust_locker_extension`
  - On-chain Barter Box extension package
- `scripts`
  - Local publish, configure, seed, and demo helpers
- `src`
  - Full, owner, and visitor browser dApp for locker configuration and trading

## Current Delivery Strategy

- Build the full loop locally first against our own sandbox world
- Use one hosted app for:
  - standalone judging/debugging
  - owner setup
  - visitor in-game assembly interaction
- Keep the hosted URL contract explicit:
  - `https://<your-pages-project>.pages.dev/?view=full`
  - `https://<your-pages-project>.pages.dev/?tenant=utopia&itemId=<item_id>&view=owner`
  - `https://<your-pages-project>.pages.dev/?tenant=utopia&itemId=<item_id>&view=visitor`
  - `view` controls presentation only; `tenant` and `itemId` provide world context
- Preserve honest staged rollout:
  - localnet first
  - Utopia public hardening
  - owned Utopia cutover last
- Use [`notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md) as the source of truth for the in-game hosting and cutover checklist.
- Use [`notes/trust-locker/FUEL-FEE-FEASIBILITY.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/FUEL-FEE-FEASIBILITY.md) as the source of truth for the owner-incentive Fuel decision.
- Keep the package compatible with Utopia and EVE Vault-style browser flows
- Treat owned Utopia in-game deployment as a late-stage milestone, not an assumption
- For localnet browser proof, use the built-in unsafe local-only demo signer instead of chasing wallet-extension custom-RPC support
- For Utopia browser proof, use a real wallet connection such as EVE Vault
- Treat the owner-incentive model as documented and staged:
  - `perpetual_market` is the circulation/storefront model
  - `procurement_market` routes visitor receipts into the same storage unit's owner reserve
  - Fuel fees remain deferred unless a real visitor-side debit and owner-controlled credit path is proven
- Run a dual audit gate before calling Phase 2 complete
- Treat the final owner and visitor UI passes as a work in progress, not a finished visual pass

## Hosting and Deployment

The hosted app is a static Vite SPA. GitHub + Cloudflare Pages is the primary deployment path. Vercel remains available as a secondary fallback.

### Runtime assumptions

- The deployed app is a single-page application, not a server-rendered site.
- The host must rewrite all paths back to `index.html`, so `tenant`, `itemId`, and `view` remain runtime query parameters.
- Cloudflare Pages must ship the SPA fallback from `public/_redirects`.
- No deployment-time secrets are required for the hosted frontend path.
- Hosted Utopia reads and writes require explicit deployment config:
  - `VITE_EVE_WORLD_PACKAGE_ID`
    - optional; defaults to the Utopia world package at build time
  - `VITE_BARTER_BOX_PACKAGE_ID`
    - required for live hosted Barter Box reads and writes
  - `VITE_BARTER_BOX_EXTENSION_CONFIG_ID`
    - required for live hosted Barter Box reads and writes
  - `VITE_SUI_RPC_URL`
    - optional; defaults to the Sui testnet fullnode used by Utopia
- `view` changes presentation only:
  - `view=full` keeps the judging and proof surfaces visible
  - `view=owner` shows the guided setup/control surface
  - `view=visitor` hides local-only and proof-only tools
- `tenant` and `itemId` are the world-context inputs from EVE Frontier or the external-browser URL.
- The local demo signer is intentionally localnet-only and must not be treated as a hosted Utopia assumption.
- The owner-incentive docs should never imply a live Fuel fee unless the world contracts prove the payment path; keep that claim deferred for now.

### Hosted URL contract

- Base host: `https://<your-host>/`
- Full-detail mode: `https://<your-host>/?view=full`
- Owner mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=owner`
- Visitor mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=visitor`
- Browser validation should preserve `tenant` and `itemId` while toggling `view`.

### Deployment flow

1. Install dependencies and verify the build locally.
2. Choose a static-SPA host:
   - GitHub + Cloudflare Pages as the primary path
   - Vercel only as a secondary fallback
3. Publish a preview or staging build.
4. Validate the hosted URL in a normal browser.
5. Verify `view=full`, `view=owner`, and `view=visitor` on the hosted URL.
6. Set the hosted Utopia env vars before expecting live policy, inventory, or wallet-backed writes.
7. Keep the owned-Utopia in-game cutover as a separate final handoff step.

### Script contract

- `pnpm build` compiles the app and is the source of truth for hosted output.
- `pnpm deploy:cloudflare:preview` builds and deploys a preview to Cloudflare Pages.
- `pnpm deploy:cloudflare:prod` builds and deploys production to Cloudflare Pages.
- `pnpm vercel-build` mirrors `pnpm build` for Vercel’s build hook.
- `pnpm deploy:vercel:preview` remains optional and performs a prebuilt preview deploy through the Vercel CLI.
- `pnpm deploy:vercel:prod` remains optional and performs a prebuilt production deploy through the Vercel CLI.

## Product Snapshot

Barter Box turns a Storage Unit into a programmable social market:

- owners define accepted item `type_id`s and point values
- owners define `friendly`, `neutral`, and `rival` pricing buckets
- visitors can still underpay
- underpaying creates a strike and cooldown instead of blocking the trade
- owners can freeze the locker policy to build public trust
- the owner-incentive model is split into:
  - `perpetual_market` for ongoing shelf circulation
  - `procurement_market` for owner reserve accumulation inside the same storage unit
  - Fuel fees deferred until proven
- the browser dApp presents the assembly context, trust state, policy, and trade preview in a Frontier-style flow
- the browser dApp now resolves live localnet policy, inventory, and signal data
- the browser dApp now has a dedicated hosted-Utopia runtime path and no longer silently falls back to localnet assumptions when `tenant=utopia`
- owner policy mutation/freeze and visitor trade execution are implemented in-browser
- localnet browser writes now use a gated unsafe local-only demo signer for repeatable proof
- the browser dApp now includes a Utopia object-discovery panel that can list owned objects and also query public Utopia storage units, gates, and network nodes for sample `item_id` values
- shared strike persistence is implemented through owner-defined strike networks
- the UI supports three views:
  - `Full Detail` mode for judges/debug
  - `Owner` mode for guided setup/control
  - `Visitor` mode for player-facing assembly interaction
- the visitor mode is intentionally transaction-first and omits owner governance by default; owner controls live in `view=owner`
- the final owner and visitor UI polish is still in progress
- the owner-incentive story is documented first, implemented later; do not narrate Fuel fees as live without the missing debit/credit proof
- the same hosted app will serve standalone browser and in-game browser contexts via the shared `tenant` + `itemId` + `view` URL contract
- Cloudflare Pages is the primary hosted path, with Vercel kept as a fallback

## Deferred v2

- world-global player trade reputation that persists across all lockers automatically
- final product naming/branding pass
