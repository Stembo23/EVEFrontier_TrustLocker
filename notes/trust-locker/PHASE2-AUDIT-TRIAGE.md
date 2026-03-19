# Barter Box Phase 2 Audit Triage

Date: 2026-03-18

This is the short version for orchestration.

## Highest Priority

- **Medium:** Complete Utopia owned-unit hosted cutover. Public hardening is now separated from the final `F`-interaction proof.
- **Medium:** Resolve or explicitly accept the external prover-stage failure in the auditor pipeline.

## Next Priority

- **Medium:** Capture a polished multi-locker shared-network demo in the browser if we want stronger presentation proof beyond tests.
- **Low:** Continue the in-game visual polish pass.

## Lower Priority

- **Low:** Keep the local demo signer locked to localnet/full-detail workflows only.

## Audit State

- `sui move test`: passed, 13/13.
- `pnpm build`: currently failing in `apps/utopia-smart-assembly/src/liveLocalnet.ts` with a `CatalogItem.volumeM3` type mismatch.
- External auditor Move scan: 0 findings, but the prover stage failed and the run is not a final signoff.
- External auditor offchain scan: not available from the current CLI because it expects a `Move.toml`.
- Utopia read-only context: validated separately, but it is not a Barter Box deployment proof.

## Orchestrator Actions

1. Do not treat Phase 2 as deployment-complete until a real owned Utopia unit opens the hosted app through `F`.
2. Do not treat Utopia public hardening as the same milestone as owned-unit cutover.
3. Do not treat Phase 2 as audit-complete until the prover failure is resolved or explicitly accepted.
4. Keep the shared strike design fixed at owner-defined strike networks, not world-global reputation.
