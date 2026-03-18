# Trust Locker MVP Acceptance Checklist

Use this checklist to accept or reject MVP readiness for hackathon submission.

## Product Contract Acceptance

- [ ] Working title only: `Trust Locker` is treated as placeholder.
- [ ] v1 scope remains local/testnet-first.
- [ ] No-scope-creep rules are preserved:
  - [ ] no multi-item baskets
  - [ ] no combat/NPC penalties
  - [ ] no global economy pricing
  - [ ] no global reputation propagation

## Move Contract Acceptance

- [ ] Policy model is per locker.
- [ ] Accepted item rules enforce unique `type_id`.
- [ ] Friendly/rival tribe overlap is rejected.
- [ ] Underpaying trade is allowed and penalized.
- [ ] Penalty state records strike count and cooldown end timestamp.
- [ ] Freeze blocks post-freeze policy edits.
- [ ] Events exist and are emitted for policy updates, trade execution, strikes, and cooldown updates.

## Test Coverage Acceptance

- [x] Existing unit tests pass.
- [x] `pnpm build` passes without TypeScript errors.
- [ ] Coverage includes:
  - [x] policy create/update
  - [x] fair trade
  - [x] underpay trade
  - [x] freeze blocks edits
  - [x] cooldown blocks repeat trade
  - [x] tribe bucket pricing behavior
  - [x] overlap rejection
  - [x] unaccepted requested/offered type rejection

## Scripts and Integration Acceptance

- [x] Localnet scripts can:
  - [x] publish package
  - [x] authorize extension
  - [x] configure policy
  - [x] seed open inventory
  - [x] seed visitor inventory
  - [x] execute fair trade
  - [x] execute dishonest trade
- [x] Deployment metadata file is generated and consumed.
- [x] Localnet execution is reproducible from a single operator command sequence.
- [x] Authoritative runbook exists for reset/prepare/verify and is accurate.

## Frontend Acceptance

- [x] UI distinguishes owner and visitor responsibilities.
- [x] UI surfaces locker trust state (mutable/frozen).
- [x] UI shows policy transparency (allowlist, points, multipliers, cooldown).
- [x] Trade preview shows fair vs underpay outcomes before signing.
- [x] UI supports owner policy mutation and freeze actions in-browser.
- [x] UI supports visitor trade execution in-browser.
- [x] UI does not redefine trade math outside shared helper layer.
- [x] UI reads live localnet deployment state instead of demo fallback data.
- [x] Localnet browser proof path no longer depends on a wallet extension with custom-RPC support.
- [x] Cooldown-blocked trades are explained explicitly in the trade UI and disable the action with a visible reason.
  Note: the live reader now resolves policy, inventory, penalties, and recent signals from localnet. Manual browser proof is still needed, but it now uses the unsafe local-only demo signer instead of a wallet extension.

## Demo Acceptance

- [x] End-to-end local demo works without manual code edits mid-run.
- [x] Demo covers at least one fair and one dishonest trade.
- [x] The localnet operator flow has been proven end to end.
- [x] Rival-pricing proof exists locally.
- [x] Submission proof matrix exists and maps each claim to a real artifact.
- [x] Demo/operator docs explicitly explain the local demo signer split versus Utopia/testnet wallet flow.
- [ ] Demo callouts explicitly mention:
  - [ ] v1 boundaries
  - [ ] v2 global reputation deferred item
  - [ ] placeholder naming status

## Go/No-Go Decision Rule

- **Go** only if the local demo remains reproducible and the frontend read integration is either complete or explicitly deferred with a documented fallback.
- **No-Go** if trade penalties, freeze trust signaling, or policy transparency are not demonstrable end-to-end.
