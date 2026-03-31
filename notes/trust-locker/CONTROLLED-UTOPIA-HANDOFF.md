# Barter Box Controlled Utopia Handoff

Use this handoff when a teammate has a real Utopia storage unit and needs to finish the live validation path.

## First Command After You Have A Unit

Run this before doing anything else:

```bash
cd /Users/anthony/Documents/EVE\ Frontier\ Smart\ Assemblies/apps/utopia-smart-assembly
ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-checklist
```

This prints:

- the exact `Admin`, `Owner`, and `Visitor` URLs
- the package and config IDs currently expected by the hosted app
- the required identity captures for owner and visitor proof
- the exact proof checklist for browser validation and later `F` cutover

The lower-level URL printer is still available when needed:

```bash
ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-handoff
```

## Identity and Access Rules

These rules are now locked in product and implementation:

- `owner` means the current onchain owner or capability holder of the storage unit
- Barter Box does not rely on "original builder forever" as the owner source of truth
- in-game:
  - owner defaults into `owner`
  - owner may switch to `visitor`
  - non-owner defaults into `visitor`
  - non-owner does not get the owner toggle
  - `Admin` is hidden
- external browser:
  - `Admin` remains available for proof and debugging
  - `owner` and `visitor` routes may still be opened directly
  - owner actions stay blocked unless the selected wallet character matches the onchain owner
- if a wallet resolves multiple characters:
  - the app must not guess
  - the operator must explicitly choose one before live writes

Proof rule:

- every live proof step should record:
  - assembly owner character ID
  - selected wallet character ID
  - whether that step is an owner or visitor action

## What Barter Box Is

Barter Box turns a Smart Storage Unit into a programmable player-run market.

At the product level:

- the owner publishes the rules
- the visitor inspects those rules before trading
- the assembly enforces those rules consistently
- the system is intentionally not a global price oracle

Game-facing motivations:

- owners use Barter Box to stock useful goods, attract traffic, and control the trade terms around their unit
- visitors use Barter Box to inspect a shelf, compare what they need against what they can offer, and decide whether the trade is worth it
- owners can freeze the ruleset to make the market more trustworthy
- visitors can still underpay, but doing so creates strikes and cooldowns instead of blocking the trade outright

### Perpetual Market

Intended game behavior:

- owner seeds the shelf with goods they want to offer
- visitors trade accepted goods into the box in exchange for what is on the shelf
- received goods go back into public shelf circulation
- the box behaves like a persistent storefront or circulating barter post

Owner motivation:

- keep useful goods moving through the shelf
- create a stable trade post with rules that stay visible to visitors
- benefit from circulation and repeat traffic rather than direct instant payout

Visitor motivation:

- trade for shelf goods they need right now
- evaluate clear terms before committing

Technical Move behavior:

- requested item moves from open inventory to visitor owned inventory inside the same storage unit
- offered item moves from visitor owned inventory to open inventory
- policy decides which `type_id`s are accepted and how many points they are worth

### Procurement Market

Intended game behavior:

- owner still seeds the shelf with goods they are willing to give up
- visitors offer accepted goods in exchange for shelf goods
- received goods do not go back to the public shelf
- received goods become claimable by the owner
- the box behaves like a standing acquisition post rather than a pure circulation shelf

Owner motivation:

- offer surplus goods to source specific inputs over time
- accumulate desired receipts in the same unit without immediately recycling them to other visitors

Visitor motivation:

- trade into a unit that is explicitly buying certain goods
- understand that their payment is going to the owner side, not back into circulation

Technical Move behavior:

- requested item still moves from open inventory to visitor owned inventory
- offered item routes into the same storage unit owner reserve instead of the public shelf
- owner can later claim or restock those receipts through the owner inventory flow

## Move Contract Design Review

This section exists so technical teammates can review the current contract choices quickly.

### Core model

- one `LockerPolicy` per storage unit
- `LockerPolicy` is stored under the shared `ExtensionConfig`, keyed by locker ID
- accepted goods are represented as `AcceptedItemRule` entries keyed by canonical on-chain `type_id`
- points are owner-defined per accepted `type_id`
- each trade is intentionally limited to:
  - one requested item type
  - one offered item type

Why:

- it keeps the trade path auditable and easy to preview in the browser
- it prevents basket-trade complexity in v1
- it keeps the policy surface legible for players

### Penalty model

- underpay is allowed instead of rejected
- local per-locker penalties are stored as `VisitorPenaltyState`
- shared cross-locker penalties are stored separately as `PersistentPenaltyState`
- shared behavior is opt-in through an owner-defined `strike_scope_id`

Why:

- it preserves player agency while still punishing bad behavior
- it avoids pretending that every unfair trade is globally illegal
- it keeps world-global reputation out of v1 while still enabling federation across owner-controlled locker networks

### Trust model

- policy can be edited while mutable
- `freeze` is irreversible
- the browser UI mirrors the frozen/mutable state as a player-facing trust signal

Why:

- owners need flexibility while configuring
- visitors need a strong signal once the market is meant to be public and stable

### Market-mode model

- `perpetual_market` and `procurement_market` are explicit on-chain policy states
- Fuel-fee support remains in schema but rejects nonzero values until a real payment path is proven

Why:

- market behavior must be explicit and immutable after freeze
- the product story should stay honest about what is and is not live

### Inventory model

- `open inventory` is the public shelf
- visitor goods live in visitor-specific owned inventory inside the same storage unit
- procurement receipts live in the storage unit owner reserve
- owner stock/claim/restock flows currently operate within the same storage unit inventories

Why:

- these flows map directly onto the world storage-unit primitives already available
- they avoid simulating inventory behavior offchain
- they are sufficient for the current submission path even though they are not yet a full game-global inventory UX

### Important intentional constraints

- no same-item trade in the browser flow
- no multi-item baskets
- no hidden math after freeze
- no global price oracle
- no fake Fuel fee

## Submission-Ready Checklist

This is the short answer to “what is already done, what is missing, and what is blocked.”

### Already implemented

- Move package with locker policy, trade logic, freeze logic, cooldowns, shared strike persistence, market modes, and events
- browser dApp with `full`, `owner`, and `visitor` views
- browser owner policy save and freeze
- browser visitor trade execution
- same-item trade block in the browser flow
- owner inventory actions in-browser for the same storage unit:
  - `Stock shelf`
  - `Claim receipts`
  - `Restock from claimable`
- Cloudflare-hosted SPA with explicit `tenant + itemId + view` URL contract
- public Utopia object discovery and direct handoff into hosted owner/visitor URLs
- localnet proof flow and local demo signer split
- launch roadmap, deployment checklist, and proof matrix

### Still missing before submission-ready

- one controlled Utopia storage unit that is actually Barter Box-enabled
- real owner and visitor inventory on that exact unit
- hosted wallet-backed proof on that exact unit for:
  - owner policy save
  - stock shelf
  - visitor trade
  - procurement claim/restock if procurement is in scope
- in-game `F` cutover proof on that same unit
- final proof package and final audit signoff

### Known blockers

- we do not yet control a real Utopia storage unit for final validation
- public discovered `itemId`s are only good for context validation, not final live proof
- the current owner inventory model is still same-storage-unit scoped, not a full player-global inventory UX
- external prover-stage audit coverage remains incomplete

### Practical submission rule

Treat the project as submission-ready only when all of these are true:

- hosted Utopia is `browser owner-ready`
- the same controlled unit works through in-game `F`
- the proof docs reflect the real live path
- no open high-severity correctness issues remain

### Identity and gating checklist

- [x] onchain owner is the owner source of truth
- [x] same-item trade is blocked in the browser flow
- [x] owner/visitor/admin views are separated in the app shell
- [x] multiple-character wallets require explicit selection before hosted writes
- [x] non-owner hosted `owner` route is read-only
- [x] in-game owner/non-owner view gating is ownership-based
- [ ] prove those identity assumptions on one controlled Utopia unit
- [ ] capture owner-character and visitor-character evidence in the final proof set

## What This Handoff Assumes

- Cloudflare Pages is already deploying from `main`
- hosted package/config env vars are already set
- the current build is already `browser read-ready`
- the remaining blocker is one controlled Utopia storage unit with real inventory and wallet-backed writes

## Required Inputs

- one real Utopia storage unit `itemId`
- permission to edit that unit custom URL
- an owner-capable wallet for that unit
- a visitor-capable wallet or character for live trade validation
- enough inventory to:
  - stock one shelf good
  - fund one visitor trade
  - optionally exercise procurement claim/restock

## Important Operating Model

Current owner inventory behavior is limited to the same storage unit:

- `Offered on shelf`
  - public shelf inventory in the unit
- `Items you are offering for trade`
  - the owner character owned-inventory slot inside that same unit
- `Claimable by owner`
  - the storage unit owner slot used by procurement-mode receipts

This is sufficient for the current launch path.

This is **not** yet a fully general player-global inventory UX inside Barter Box.

## Step 1: Print the Exact Hosted URLs

From [`apps/utopia-smart-assembly`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly):

```bash
ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-handoff
```

Optional:

```bash
HOSTED_APP_URL=https://evefrontier-b.pages.dev/
```

This prints:

- `Admin URL`
- `Owner URL`
- `Visitor URL`
- the currently resolved world/package/config IDs

## Step 2: Confirm the Unit Is the Real Validation Target

Before any proof capture:

- open the `Owner URL`
- confirm the app resolves live state for that exact unit
- confirm the unit is actually Barter Box-enabled
- confirm the owner wallet can attempt live actions
- record the assembly owner character ID shown by the runtime
- record which wallet character the app selected or required you to select

Do not use a random public object as the final validation target.

## Step 3: Provision Inventory

Use the currently supported storage-unit inventory flow to ensure:

- the owner side has at least one item available in `Items you are offering for trade`
- the shelf has at least one offered good
- the visitor side has at least one accepted-in-exchange good
- procurement mode can produce claimable receipts if procurement is in scope

Recommended minimum:

- Shelf: one item with quantity greater than one
- Visitor: one accepted payment item
- Procurement: one scenario that yields non-empty `Claimable by owner`

Important:

- `Items you are offering for trade` is the owner character inventory inside the same unit
- `Claimable by owner` is procurement-only owner receipt inventory inside the same unit
- the current launch path still assumes same-storage-unit inventory movement, not a full player-global inventory UX inside Barter Box

## Step 4: Hosted Validation Sequence

Run these in order on the same controlled unit:

1. one owner policy save
2. one `Stock shelf`
3. one visitor trade
4. if procurement mode is active, one `Claim receipts` or `Restock from claimable`

Capture for each:

- screenshot
- transaction digest
- whether the bottom-strip action feedback was correct
- assembly owner character ID
- selected wallet character ID

## Step 5: In-Game Cutover

Once hosted validation is green:

1. set the unit custom URL to the hosted Barter Box app
2. use `view=visitor` as the default in-game target
3. open the unit in-game with `F`
4. confirm the app opens against the same live unit
5. confirm the owner can reach `owner` mode
6. run one in-game visitor interaction

## What Counts as `browser owner-ready`

Do not call the project `browser owner-ready` until all of these succeed on the same controlled unit:

- owner policy save
- `Stock shelf`
- visitor trade
- `Claim receipts` or `Restock from claimable` when procurement is in scope

## Where To Read Next

- [Launch roadmap](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/LAUNCH-ROADMAP.md)
- [Phase 2 in-game deployment](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md)
- [Operator runbook](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/OPERATOR-RUNBOOK.md)
- [Submission proof matrix](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/SUBMISSION-PROOF-MATRIX.md)
