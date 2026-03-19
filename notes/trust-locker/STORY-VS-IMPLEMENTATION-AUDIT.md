# Barter Box MVP Story vs Implementation Audit

Date: 2026-03-17 (America/Los_Angeles)

## Story We Are Telling

- Players can run programmable social markets on top of Storage Units.
- Owners publish transparent rules: accepted items, point values, and tribe-sensitive pricing.
- Visitors can underpay, but the system remembers and penalizes through strike + cooldown.
- Frozen configuration increases trust because the owner can no longer mutate policy.
- Phase 2 extends the mechanic into a real in-world assembly dApp with a cleaner player-facing visitor mode and a guided owner setup mode.
- Phase 2 also adds shared strike persistence across owner-defined locker networks.

## Current Implementation Reality

## What is already aligned

- **Per-locker policy model exists** in Move with accepted item rules, tribe buckets, multipliers, cooldown, and active flag.
- **Underpaying trade path exists** and emits strike/cooldown events.
- **Freeze path exists** and policy mutation checks enforce frozen-state immutability.
- **Per-character penalty state exists** inside each locker policy (not global reputation).
- **Localnet operational flow is proven** end to end: authorize, configure, seed-open, seed-visitor, fair trade, dishonest trade.
- **Frontend now communicates the full owner/visitor product shape** including trust state, live policy, live inventory, fair vs underpay preview, owner policy mutation, freeze, and visitor trade execution paths.
- **Frontend now includes a local-only demo signer path** for localnet browser proof, which removes the dependency on a wallet extension supporting custom RPC.
- **Repo build is clean at head** and the new operator wrappers are working.
- **Utopia context resolution is proven** through a real public `itemId` and EVE Vault browser pass.
- **Owner-incentive docs now distinguish** `perpetual_market` from `procurement_market` and explicitly defer Fuel fees until the payment path is proven.

## What is partially aligned

- **Frontend now uses live localnet reads** for locker policy, trust state, penalty state, inventory balances, and recent signals, but the browser-side manual proof run still needs to be captured.
- **Script lane now has full localnet transaction automation** for publish/configure/seed/open-visitor/trade flows, plus read-side inspect/signals helpers.
- **Rival-pricing behavior is locally proven** through a real tribe update and a live quoted-point change, but not yet through a dedicated rival trade transcript.
- **Submission docs now exist** for the operator runbook and proof matrix, and now describe the local-demo-signer split versus the Utopia wallet path.

## What is not yet aligned

- **Global player reputation** across all lockers is not implemented by design in v1 (deferred to v2).
- **Live localnet-backed end-to-end browser UI read/write flow** is implemented but not yet demonstrated in a captured QA/browser evidence set.
- **In-game deployment** is not yet aligned:
  - we do not have a hosted public app
  - we do not have a controlled in-game storage unit wired to that hosted URL
- **Three-view UI** is aligned functionally but not visually complete:
  - `full`, `owner`, and `visitor` separation exists
  - the visitor and owner modes are cleaner, but the final art/polish pass is still open
- **Shared strike persistence** is aligned locally:
  - penalties now persist across owner-defined strike networks
  - the mechanism is tested
  - a polished live multi-locker UI demo is still optional follow-up work
- **Fuel-fee owner incentive remains unimplemented**:
  - the repo does not prove a visitor-side Fuel debit and owner-controlled credit path
  - the fallback owner motivation model is the documented market split and owner reserve
- **Dual audit gate** is only partially aligned:
  - internal audit is documented
  - external deterministic Move scan is documented
  - prover-stage signoff is still open

## Scope Integrity Check

v1 boundaries are currently respected:

- single-line-item trade shape
- curated allowlist model
- no combat/NPC punishment
- no global economy oracle
- no world-global reputation propagation

v2 deferred items are documented:

- global player trade reputation carried across lockers
- contract/package rename pass, if ever desired, is still deferred

## Risk Register

1. **Proof risk (high)**  
Current evidence emphasizes unit tests + localnet scripts; without one repeatable browser run through the new local demo signer path, demo credibility is weaker than it should be.

2. **Behavioral gap risk (medium)**  
If cooldown-block and invalid-`type_id` paths are not explicitly demonstrated in tests and demo script, exploit claims remain under-proven.

3. **Narrative drift risk (medium)**  
If the demo language implies global reputation before v2, reviewers may treat scope as incomplete or inconsistent.

4. **Naming drift risk (low)**  
Renaming mid-implementation could break coordination unless explicitly orchestrated after MVP stabilization.

## Recommended Next Validation Steps

1. Capture one browser proof run covering owner save/freeze and visitor trade through the local demo signer path.
2. Execute one dedicated rival trade transcript to complement the quote-based rival proof.
3. Preserve the current localnet script sequence as the source of truth for demo reproducibility.
4. Keep Utopia language precise: context resolution is proven, but sampled public behavior deployment availability is object-dependent until we control an owned unit.
5. Resolve or explicitly accept the external prover-stage failure before calling Phase 2 audit-complete.

## Acceptance Position (Current)

- **Phase 2 partially accepted:** shared strike persistence and the three-view UI are implemented and verified locally; hosted owned-unit cutover and final audit signoff remain open.
