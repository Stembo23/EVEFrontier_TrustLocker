# Barter Box Agent Contract

## Product Vision

`Barter Box` is the product name for this programmable social market for EVE Frontier. Package and module identifiers remain `trust_locker` until there is an explicit contract-level rename pass. The product is not an objective pricing oracle. Owners publish a ruleset, visitors inspect that ruleset, and the assembly enforces the declared policy consistently.

Phase 2 extends the MVP into:
- a hosted in-world assembly dApp that opens in the in-game browser when players press `F`
- a three-view UI (`full`, `owner`, and `visitor`)
- shared strike persistence across owner-defined Barter Box networks
- Utopia public hardening, then owned-Utopia cutover, then post-cutover hardening
- a dual audit gate before Phase 2 is considered complete

## Canonical Vocabulary

- `locker`: a storage unit running the Barter Box extension
- `open inventory`: the public shelf inventory for the locker
- `owned inventory`: a visitor-specific inventory inside the same storage unit
- `points`: the owner-defined fairness score assigned per accepted `type_id`
- `strike`: the on-chain penalty record created by an underpaying trade
- `cooldown`: the period during which a visitor cannot trade with the same locker again
- `bucket`: one of `friendly`, `neutral`, or `rival`
- `freeze`: the irreversible storage-unit extension freeze that locks locker policy edits
- `strike network`: an owner-defined trust federation across multiple lockers
- `shared penalty`: strike-derived pricing or lockout effects that follow a character across lockers in the same strike network

## Phase 2 Boundaries

- Single locker extension package
- Single requested item type plus single offered item type per trade
- Curated allowlist only
- Localnet full demo first
- Utopia public hardening after localnet parity is frozen
- Hosted app used for both standalone browser and in-game browser
- Utopia in-game cutover only after the hosted app is validated on a controlled assembly
- Owned-Utopia cutover is the final live deployment milestone
- Shared strike persistence is owner-defined by strike network, not world-global

## No-Scope-Creep Rules

- No multi-item basket trades in v1
- No combat, NPC, or destruction penalties in v1
- No global economy pricing in v1
- No diplomacy graph beyond owner-defined tribe buckets in v1
- No hidden or mutable trade math after a locker has been frozen
- No world-global reputation propagation
- No separate native-client-only UI implementation; in-game uses the same hosted web app

## Lane Ownership

### Orchestrator / PM

- Owns this file, acceptance criteria, merge order, and cross-lane interface decisions
- Resolves drift between contract, scripts, and dApp interfaces

### Move / Smart Assembly Lane

- Owns `apps/utopia-smart-assembly/move-contracts/trust_locker_extension`
- Defines the on-chain policy model, trade logic, strike logic, cooldown logic, shared strike-network logic, and events
- Must not change public types or entrypoints without updating the orchestrator plan

### Scripts / World Integration Lane

- Owns `apps/utopia-smart-assembly/scripts`
- Publishes the package, configures lockers, seeds inventory, and prints discovered IDs
- Owns hosting/deployment glue for public URLs and in-game cutover checklists
- Must consume published Move interfaces rather than re-defining them

### Frontend / dApp Lane

- Owns `apps/utopia-smart-assembly/src`
- Shows locker trust state, policy, trade preview, owner configuration flows, and shared penalty state in the browser dApp
- Must support browser-side owner policy writes and visitor trade execution in the submission path
- Must support both:
  - `view=full`
  - `view=owner`
  - `view=visitor`
- Must maintain the explicit split between:
  - localnet browser proof via the unsafe local-only demo signer
  - Utopia browser proof via a real wallet connection
- Must treat on-chain `type_id` as the canonical item key

### QA / Demo Lane

- Owns `notes/trust-locker`
- Owns internal audit records, external auditor outputs, scenario coverage, demo scripts, and proof points
- Must report drift between product story and real implementation immediately

## Shared Interface Contracts

- The Move package is the source of truth for:
  - `LockerPolicy`
  - `AcceptedItemRule`
  - `VisitorPenaltyState`
  - `StrikeNetworkPolicy`
  - `PersistentPenaltyState`
  - policy update events
  - trade events
  - strike and cooldown events
- Shared penalty math is still on-chain truth. Frontend/script code may only mirror it for preview.
- Scripts and dApp code may add local display metadata, but must not redefine trade math
- Human-readable item labels and icons belong in frontend/script config, not on-chain

## Deferred v2 Items

- World-global reputation that persists across all lockers automatically
- Final product naming and brand pass after the core mechanic is proven

## Merge Order

1. Docs/orchestrator sync
2. Move interfaces and tests
3. Frontend architecture
4. Frontend visual redesign
5. Scripts/deployment helpers
6. Audit remediation and QA proof

## Agent Workflow

- Every agent or thread should start by reading this file and the current Barter Box README
- Every lane should publish:
  - assumptions
  - required inputs
  - completion checklist
- If a lane needs a shared-interface change, stop and hand the change back to the orchestrator before editing
