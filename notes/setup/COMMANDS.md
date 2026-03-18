# Validated Commands

## Load the workspace toolchain in a fresh shell

```zsh
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
```

## Verify toolchain versions

```zsh
zsh -lc 'node -v && pnpm -v && sui --version'
```

## Start the host localnet with faucet

```zsh
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
sui start --with-faucet --force-regenesis
```

## Switch the CLI to localnet

```zsh
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
sui client switch --env localnet
```

## Re-run the official local world flow

```zsh
cd "/Users/anthony/Documents/EVE Frontier Smart Assemblies/vendor/world-contracts"
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
pnpm deploy-world localnet
pnpm configure-world localnet
pnpm create-test-resources localnet
```

## Re-run the official sample builder flow

```zsh
cd "/Users/anthony/Documents/EVE Frontier Smart Assemblies/vendor/builder-scaffold"
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
pnpm configure-rules
pnpm authorise-gate-extension
pnpm authorise-storage-unit-extension
pnpm issue-tribe-jump-permit
pnpm jump-with-permit
```
