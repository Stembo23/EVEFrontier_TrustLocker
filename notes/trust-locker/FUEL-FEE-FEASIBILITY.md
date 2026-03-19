# Barter Box Fuel Fee Feasibility

Date: 2026-03-19

This note records the owner-incentive spike outcome for the Fuel-fee idea.

## Decision

Current repo evidence is a **no-go** for a live Fuel fee path.

The codebase does not yet prove all four required conditions:
- a real visitor-side Fuel debit path during Barter Box trade
- a real owner-controlled credit sink for that Fuel
- atomic failure semantics for item trade plus Fuel settlement
- Utopia parity rather than a localnet-only coincidence

Until those conditions are proven, Fuel fees are **deferred** and must not be simulated.

## Evidence Reviewed

- Upstream world contracts expose Fuel primitives and network-node energy handling.
- Storage Unit APIs clearly support:
  - open inventory
  - visitor-owned inventory
  - owner inventory inside the same storage unit
- The repo does **not** currently show a character-side Fuel debit or credit API that can be wired into the trade path.

## Product Implication

The owner-incentive fallback is the market-mode split:

- `perpetual_market`
  - current public shelf circulation model
  - future Fuel fee remains deferred until the missing path is proven
- `procurement_market`
  - visitor-offered goods route into the same storage unit's owner reserve
  - no Fuel fee in the initial design

## Next Step

If a future world-contract or runtime change exposes a real Fuel payment path, this note should be revisited and the Fuel-fee design can move from deferred to active.
