# Barter Box Controlled Utopia Handoff

Use this handoff when a teammate has a real Utopia storage unit and needs to finish the live validation path.

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
