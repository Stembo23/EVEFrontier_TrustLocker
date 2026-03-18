# EVE Frontier Smart Assemblies Setup Status

## Current state

- Primary environment: Codex desktop app
- Workspace root: `/Users/anthony/Documents/EVE Frontier Smart Assemblies`
- Tenant target: `utopia`
- Sui network target: `testnet`
- Current default Sui CLI environment: `testnet`
- CLI wallet role: reserved for build/publish/admin operations
- EVE Vault role: reserved for browser-connected EVE Frontier interactions

## Completed

- Created the workspace layout:
  - `vendor/`
  - `apps/utopia-smart-assembly/`
  - `notes/setup/`
- Installed a workspace-local Node.js toolchain at `.toolchains/node`
- Activated `pnpm` through the local Node/corepack toolchain
- Installed `suiup` to `/Users/anthony/.local/bin/suiup`
- Added a reusable shell bootstrap file at `notes/setup/codex-env.zsh`
- Added the shell bootstrap to `~/.zprofile` and `~/.zshrc`
- Installed the Sui CLI testnet build through `suiup`
- Created dedicated project Sui aliases:
  - `eve-smart-assemblies-testnet`
  - `eve-smart-assemblies-player-a`
  - `eve-smart-assemblies-player-b`
- Confirmed the existing Sui client config already targets `testnet`
- Cloned the official repos:
  - `vendor/builder-scaffold`
  - `vendor/world-contracts`
  - `vendor/evevault`
- Installed Node dependencies for both official repos
- Installed Bun and EVE Vault monorepo dependencies
- Built the EVE Vault Chrome extension from source
- Started a fresh host localnet with `sui start --with-faucet --force-regenesis`
- Added a `localnet` Sui CLI environment pointing at `http://127.0.0.1:9000`
- Funded the three project wallets on localnet
- Deployed the EVE Frontier world contracts to localnet
- Configured the local world and seeded test resources
- Copied world deployment artifacts into `builder-scaffold`
- Published the sample `smart_gate_extension` contract on localnet
- Wired the live local package IDs into the scaffold `.env`
- Validated the sample scaffold flow:
  - `pnpm configure-rules`
  - `pnpm authorise-gate-extension`
  - `pnpm authorise-storage-unit-extension`
  - `pnpm issue-tribe-jump-permit`
  - `pnpm jump-with-permit`

## Verified local IDs

- Local world package: `0x00440bd1a0d7a6f62fa7ebc235ec1d16ca0a4f27c663ca25c2cec19237b4ffff`
- Local builder package: `0xfff60b29864b98749cb3d887f3cbbcfaeaaf91fec7d1339eef4741059a20db71`
- Local extension config: `0xab69454d9dd91a9b0b1f0a11bb15aacdb820f0871edc39bf233c8061a287450a`

## Blockers / deviations from the original plan

- Homebrew installation failed because the current macOS account does not have the admin access required by the official installer.
- Google Chrome and Visual Studio Code are already installed as applications, so no additional browser/IDE install was needed.
- Docker Desktop is still not installed, but the official host-based localnet flow is already working without it.
- Testnet faucet funding still requires the Sui web faucet UI.
- EVE Vault source builds locally, but Utopia auth is still blocked without private FusionAuth/Enoki credentials.
- EVE Vault still requires manual browser installation/sign-in/PIN setup.
- Utopia live-object discovery is still pending because it depends on the browser-authenticated EVE Frontier flow.

## Next checks

- Fund `eve-smart-assemblies-testnet` on Sui testnet through the web faucet
- Install and sign into EVE Vault with the Utopia sandbox account
- Confirm the browser wallet is pointed at Sui Testnet
- Perform read-only discovery against the Utopia tenant and record the live package/object IDs
- Decide whether Docker Desktop is still needed now that the host localnet flow is working
