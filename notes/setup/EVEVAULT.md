# EVE Vault Source Setup Notes

## What was completed

- Cloned the official repo to `vendor/evevault`
- Installed Bun locally on this Mac (`bun 1.3.10`)
- Installed the monorepo dependencies with `bun install`
- Built the Chrome MV3 extension successfully with:

```zsh
cd "/Users/anthony/Documents/EVE Frontier Smart Assemblies/vendor/evevault"
source "/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/setup/codex-env.zsh"
bun run build:ext
```

- Build output exists at:
  - `vendor/evevault/apps/extension/.output/chrome-mv3`

## Important limitation

The repo is **buildable without secrets**, but **Utopia login is not usable from source on this machine right now**.

Why:

- `packages/shared/src/utils/tenantConfig.ts` throws if a non-default tenant has no client secret.
- `utopia` is a non-default tenant.
- The required env variables are currently unset:
  - `VITE_TENANT_UTOPIA_CLIENT_SECRET`
  - `VITE_ENOKI_API_KEY`
  - `VITE_FUSIONAUTH_API_KEY`
  - `EXTENSION_ID`

## Practical conclusion

- The source build is useful for code review and future local development.
- For actual **Utopia** use in Chrome, the safer path is still the **official released extension** unless valid private auth credentials are provided for local source builds.

## If credentials become available later

The next source-build steps would be:

1. create `vendor/evevault/.env`
2. add the real FusionAuth and Enoki values
3. rebuild with `bun run build:ext`
4. load `vendor/evevault/apps/extension/.output/chrome-mv3` as an unpacked extension in Chrome
