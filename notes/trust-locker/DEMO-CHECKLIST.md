# Trust Locker MVP Demo Checklist

This checklist is for the local/testnet-first MVP demo run.

## Phase 2 Extension Gates

- [ ] Hosted app URL exists and is stable over HTTPS.
- [x] `view=full` and `view=in-game` both render correctly in the app build and URL contract.
- [x] The hosted URL contract is documented in [`PHASE-2-IN-GAME-DEPLOYMENT.md`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md).
- [x] In-Game mode removes debug-only panels and test scaffolding.
- [x] Shared strike persistence works across lockers in the same strike network.
- [x] Shared strike persistence does not leak across unrelated strike networks.
- [x] Internal audit findings are triaged.
- [ ] External auditor findings are triaged.
- [ ] Controlled in-game storage unit opens the hosted app via `F`.

## Demo Readiness Gate

- [ ] `Trust Locker` naming is presented as a working title in demo narration.
- [ ] v1 boundaries are stated before the demo starts.
- [ ] v2 deferred items are stated at close (global reputation and final naming pass).
- [ ] Browser UI can execute owner policy writes and visitor trades without operator script intervention.
  Code path is implemented; the manual run should now use the unsafe local-only demo signer on localnet.
- [ ] Cooldown countdown updates automatically in the UI during evidence capture.
- [x] Localnet demo state is current: authorize, configure, seed-open, seed-visitor, fair trade, and dishonest trade all succeed.

## Environment Readiness

- [x] Local world is deployed and configured.
- [x] Trust Locker package is published.
- [x] Deployment metadata exists at `apps/utopia-smart-assembly/deployments/localnet/trust-locker.json`.
- [x] Demo identities are prepared: owner character + visitor character(s).
- [x] Locker assembly is online and extension-authorized.
- [x] Visitor inventory funding script is available for repeatable demo setup.

## Scenario 1: Fair Locker (Baseline)

- [x] Owner configures curated allowlist (`type_id` + points).
- [x] Owner configures tribe buckets and multipliers.
- [x] Owner seeds open inventory.
- [x] Visitor executes a fair trade (`deficit_points == 0`).
- [x] Demo shows no strike increment and no cooldown application.

## Scenario 2: Rival Pricing

- [x] Rival visitor path is shown (or simulated with rival tribe assignment).
- [x] Quote/preview shows higher requested points than neutral/friendly path.
- [x] One rival trade executes and expected pricing behavior is observed.

## Scenario 3: Dishonest Trade

- [x] Visitor underpays intentionally.
- [x] Trade still executes.
- [x] `StrikeIssued` and `CooldownUpdated` behavior is demonstrated.
- [x] Follow-up attempt during cooldown is rejected or blocked as expected.
- [x] Cooldown block is communicated explicitly in the UI, not only via a timer.

## Scenario 4: Trust Signaling

- [ ] Demo compares mutable locker policy vs frozen policy in-browser.
- [x] Freeze action is shown as irreversible in owner flow.
- [x] Visitor-facing UI clearly indicates trust state (mutable/frozen).
- [x] Cooldown block is visible in the UI and prevents trading during active lockout.

## Scenario 5: Predatory Locker Visibility

- [ ] Owner configures intentionally hostile multipliers/points.
- [x] Visitor can inspect policy and preview deficit before execution.
- [ ] Demo emphasizes player agency: accept trade, avoid locker, or take penalty risk.

## Delivery Artifacts

- [ ] Recorded run or transcript for each browser UI scenario.
- [x] Recorded run or script transcript for the local operator sequence exists.
- [ ] Recorded run explicitly shows the `Local Demo Signer` panel being used for localnet browser writes.
- [ ] Recorded run explicitly shows the cooldown countdown updating without a manual refresh.
- [ ] Final demo script includes one sentence each for:
  - [ ] v1 scope
  - [ ] v2 deferred global reputation
  - [ ] placeholder naming status
- [ ] Final demo script explicitly notes the exact current remaining proof gaps, rather than implying full Utopia wallet-backed validation is already captured.
- [x] Utopia read-only/context validation is demonstrated with a real public `itemId`.
- [x] Demo language states that public object context loaded successfully even though the sampled external behavior deployment returned `DEPLOYMENT_NOT_FOUND`.
