# EVE Frontier Trust Locker

Trust Locker is a programmable Smart Storage Unit extension for EVE Frontier.

It turns a storage unit into a player-run social market:

- owners define which item types the locker accepts
- owners assign point values to those items
- owners can price differently for friendly, neutral, and rival visitors
- visitors can still underpay, but doing so creates strikes and cooldowns
- owners can freeze the ruleset so traders know the policy cannot change afterward

`Trust Locker` is a working title. The product name may change.

## What This Repo Contains

- A Move package for the Trust Locker storage-unit extension
- Local deployment, seeding, inspection, and demo scripts
- A browser dApp for owner configuration and visitor trade flows
- Submission, demo, audit, and deployment notes for the project

## Current Project Status

The project is beyond the initial MVP and currently includes:

- local/testnet end-to-end trading flows
- browser-based owner and visitor interactions
- dual UI modes:
  - `view=full` for judging, debugging, and proof capture
  - `view=in-game` for player-facing assembly interaction
- owner-defined shared strike networks across multiple lockers
- local proof flows and Utopia read-only context validation

Still in progress:

- final in-game UI polish
- hosted deployment and owned-Utopia in-game cutover
- final audit signoff

## Core Design

Trust Locker is intentionally **not** a universal price oracle.

Instead:

- the owner publishes a ruleset
- the visitor inspects that ruleset
- the assembly enforces the published policy consistently

That means fairness is social and programmable, not global and objective.

## Key Features

### Locker policy

Owners can configure:

- accepted item `type_id`s
- point values per accepted item
- friendly / neutral / rival pricing buckets
- cooldown duration
- active / inactive state
- irreversible policy freeze

### Trading model

Each trade currently uses:

- one requested item type
- one offered item type

If the visitor underpays:

- the trade can still execute
- the locker records a strike
- the locker applies a cooldown

### Shared strike persistence

Lockers can optionally join an owner-defined strike network.

When enabled:

- strikes can persist across multiple lockers in the same network
- repeat bad behavior can increase pricing
- repeat bad behavior can trigger wider lockouts across that locker network

This is intentionally scoped to explicit locker networks, not world-global reputation.

## Repository Layout

- `apps/utopia-smart-assembly`
  - main application workspace
- `apps/utopia-smart-assembly/move-contracts/trust_locker_extension`
  - Move smart-contract package
- `apps/utopia-smart-assembly/scripts`
  - local deployment, seed, inspect, and demo helpers
- `apps/utopia-smart-assembly/src`
  - browser dApp
- `notes/trust-locker`
  - roadmap, audit, deployment, demo, and proof documentation
- `vendor`
  - upstream/reference dependencies used by the project

## Local Development

The active app workspace is:

- [`apps/utopia-smart-assembly/README.md`](apps/utopia-smart-assembly/README.md)

Typical local workflow:

1. install dependencies
2. build the frontend
3. run Move tests
4. use the local demo/operator scripts to prepare the environment

Core checks:

```bash
cd apps/utopia-smart-assembly
pnpm build
sui move test --path move-contracts/trust_locker_extension
```

## Hosting

The frontend is a static SPA and can be hosted on any HTTPS static host that supports SPA fallback routing.

Supported deployment approaches:

- GitHub + Cloudflare Pages
- Vercel

Hosted URL contract:

- full-detail mode:
  - `https://<host>/?view=full`
- in-game mode:
  - `https://<host>/?tenant=utopia&itemId=<item_id>&view=in-game`

`tenant` and `itemId` provide world context. `view` controls presentation only.

## Roadmap

Near-term priorities:

- finish final in-game UI polish
- deploy the hosted app publicly
- point a controlled Utopia storage unit at the hosted app
- validate the in-game `F` interaction path
- complete internal and external audit signoff

Deferred:

- world-global reputation across all lockers
- final branding/name pass

## Documentation

Key project notes:

- [Trust Locker workspace README](apps/utopia-smart-assembly/README.md)
- [Agent contract](AGENTS.md)
- [Project status](notes/trust-locker/STATUS.md)
- [Phase 2 in-game deployment](notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md)
