# Trust Locker Workspace

`Trust Locker` is a working title. Keep code semantics stable, but treat product naming as provisional until we choose a final name.

This workspace contains the project-owned code for the Trust Locker Smart Assembly Phase 2 build.

## Scope

- `move-contracts/trust_locker_extension`
  - On-chain Trust Locker extension package
- `scripts`
  - Local publish, configure, seed, and demo helpers
- `src`
  - Visitor and owner browser dApp for locker configuration and trading

## Current Delivery Strategy

- Build the full loop locally first against our own sandbox world
- Use one hosted app for:
  - standalone judging/debugging
  - in-game assembly interaction
- Keep the hosted URL contract explicit:
  - `https://<your-vercel-project>.vercel.app/?view=full`
  - `https://<your-vercel-project>.vercel.app/?tenant=utopia&itemId=<item_id>&view=in-game`
  - `view` controls presentation only; `tenant` and `itemId` provide world context
- Preserve honest staged rollout:
  - local/testnet first
  - controlled in-game browser validation
  - owned Utopia cutover last
- Use [`notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md) as the source of truth for the in-game hosting and cutover checklist.
- Keep the package compatible with Sui testnet and EVE Vault-style browser flows
- Treat owned Utopia in-game deployment as a late-stage milestone, not an assumption
- For localnet browser proof, use the built-in unsafe local-only demo signer instead of chasing wallet-extension custom-RPC support
- For Utopia/testnet browser proof, use a real wallet connection such as EVE Vault
- Run a dual audit gate before calling Phase 2 complete
- Treat the final in-game UI as a work in progress, not a finished visual pass

## Hosting and Deployment

The hosted app is a static Vite SPA. Vercel is supported and already scaffolded, but it is not required. A GitHub + Cloudflare Pages/Workers path is also valid as long as the host serves the same SPA and preserves the query-string contract.

### Runtime assumptions

- The deployed app is a single-page application, not a server-rendered site.
- The host must rewrite all paths back to `index.html`, so `tenant`, `itemId`, and `view` remain runtime query parameters.
- No deployment-time secrets are required for the hosted frontend path today.
- `view` changes presentation only:
  - `view=full` keeps the judging and proof surfaces visible
  - `view=in-game` hides local-only and proof-only tools
- `tenant` and `itemId` are the world-context inputs from EVE Frontier or the external-browser URL.
- The local demo signer is intentionally localnet-only and must not be treated as a hosted Utopia assumption.

### Hosted URL contract

- Base host: `https://<your-host>/`
- Full-detail mode: `https://<your-host>/?view=full`
- In-game mode: `https://<your-host>/?tenant=utopia&itemId=<item_id>&view=in-game`
- Browser validation should preserve `tenant` and `itemId` while toggling `view`.

### Deployment flow

1. Install dependencies and verify the build locally.
2. Choose a static-SPA host:
   - Vercel using the provided helper scripts
   - or GitHub + Cloudflare Pages/Workers
3. Publish a preview or staging build.
4. Validate the hosted URL in a normal browser.
5. Verify both `view=full` and `view=in-game` on the hosted URL.
6. Keep the owned-Utopia in-game cutover as a separate final handoff step.

### Script contract

- `pnpm build` compiles the app and is the source of truth for hosted output.
- `pnpm vercel-build` mirrors `pnpm build` for Vercel’s build hook.
- `pnpm deploy:vercel:preview` is optional and performs a prebuilt preview deploy through the Vercel CLI.
- `pnpm deploy:vercel:prod` is optional and performs a prebuilt production deploy through the Vercel CLI.

## Product Snapshot

Trust Locker turns a Storage Unit into a programmable social market:

- owners define accepted item `type_id`s and point values
- owners define `friendly`, `neutral`, and `rival` pricing buckets
- visitors can still underpay
- underpaying creates a strike and cooldown instead of blocking the trade
- owners can freeze the locker policy to build public trust
- the browser dApp presents the assembly context, trust state, policy, and trade preview in a Frontier-style flow
- the browser dApp now resolves live localnet policy, inventory, and signal data
- owner policy mutation/freeze and visitor trade execution are implemented in-browser
- localnet browser writes now use a gated unsafe local-only demo signer for repeatable proof
- the browser dApp now includes a Utopia object-discovery panel that can list owned objects and also query public Utopia storage units, gates, and network nodes for sample `item_id` values
- shared strike persistence is implemented through owner-defined strike networks
- the UI will support both:
  - `Full Detail` mode for judges/debug
  - `In-Game` mode for player-facing assembly interaction
- the final in-game UI polish is still in progress
- the same hosted app will serve standalone browser and in-game browser contexts via the shared `tenant` + `itemId` + `view` URL contract

## Deferred v2

- world-global player trade reputation that persists across all lockers automatically
- final product naming/branding pass
