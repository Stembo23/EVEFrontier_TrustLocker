# EVE Frontier Barter Box

Barter Box is a programmable Smart Storage Unit extension for EVE Frontier.

It turns a storage unit into a player-run social market:

- owners define which item types the locker accepts
- owners assign point values to those items
- owners can price differently for friendly, neutral, and rival visitors
- visitors can still underpay, but doing so creates strikes and cooldowns
- owners can freeze the ruleset so traders know the policy cannot change afterward
- the owner-incentive model is being extended to support two market modes:
  - `perpetual_market` for the current public shelf / circulation model
  - `procurement_market` for owner-directed acquisition, where incoming goods route into the same storage unit's owner reserve
- Fuel fees are deferred unless a real visitor-side Fuel debit and owner-controlled credit path is proven on the world contracts

`Barter Box` is the product name. Package and module identifiers remain `trust_locker` for on-chain stability.

## What This Repo Contains

- A Move package for the Barter Box storage-unit extension
- Local deployment, seeding, inspection, and demo scripts
- A browser dApp for owner configuration and visitor trade flows
- Submission, demo, audit, and deployment notes for the project

## Current Project Status

The project is beyond the initial MVP and currently includes:

- local/testnet end-to-end trading flows
- browser-based full, owner, and visitor interactions
- three UI modes:
  - `view=full` for judging, debugging, and proof capture
  - `view=owner` for guided setup and control
  - `view=visitor` for player-facing assembly interaction
- owner-defined shared strike networks across multiple lockers
- local proof flows and Utopia read-only context validation

Still in progress:

- final visitor and owner UI polish
- hosted deployment and owned-Utopia in-game cutover
- owner-incentive mode implementation and the Fuel-fee feasibility follow-up
- final audit signoff

## Core Design

Barter Box is intentionally **not** a universal price oracle.

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

The planned owner-incentive split is:

- `perpetual_market`
  - current shelf-circulation behavior
  - any future Fuel fee would apply here only if the fee path is proven
- `procurement_market`
  - incoming visitor goods route into the same storage unit's owner reserve
  - no Fuel fee in the initial design

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

### Owner incentive model

The current repo evidence does not yet prove a direct Fuel payment path from visitor to owner during trade. Until that is proven, the Fuel fee is treated as deferred and the owner-incentive fallback is the reserve-based market split above.

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

- GitHub + Cloudflare Pages as the primary path
- Vercel as a secondary fallback

Hosted URL contract:

- full-detail mode:
  - `https://<host>/?view=full`
- owner mode:
  - `https://<host>/?tenant=utopia&itemId=<item_id>&view=owner`
- visitor mode:
  - `https://<host>/?tenant=utopia&itemId=<item_id>&view=visitor`

`tenant` and `itemId` provide world context. `view` controls presentation only.

Cloudflare Pages is the primary host. Vercel stays available as a fallback.

## Roadmap

Near-term priorities:

- finish final owner and visitor UI polish
- deploy the hosted app publicly
- point a controlled Utopia storage unit at the hosted app
- validate the visitor `F` interaction path
- finish the owner-incentive model decision path:
  - document the Fuel-fee feasibility result
  - implement market-mode docs and UI language around `perpetual_market` and `procurement_market`
- complete internal and external audit signoff

Deferred:

- world-global reputation across all lockers
- final branding/name pass

## Documentation

Key project notes:

- [Barter Box workspace README](apps/utopia-smart-assembly/README.md)
- [Agent contract](AGENTS.md)
- [Project status](notes/trust-locker/STATUS.md)
- [Fuel-fee feasibility memo](notes/trust-locker/FUEL-FEE-FEASIBILITY.md)
- [Phase 2 in-game deployment](notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md)
