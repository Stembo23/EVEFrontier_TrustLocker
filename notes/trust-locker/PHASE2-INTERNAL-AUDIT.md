# Trust Locker Phase 2 Internal Audit Findings

Date: 2026-03-18

Scope: Trust Locker Move package, browser dApp, local demo signer flow, hosted/in-game readiness surfaces, and Phase 2 coordination docs.

Method:
- Reviewed [AGENTS.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/AGENTS.md)
- Reviewed [README.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/README.md)
- Reviewed current Trust Locker Move and offchain code paths
- Ran `sui move test` in the Move package directory
- Ran `pnpm build` in the app workspace
- Ran a deterministic external-auditor CLI scan against the Trust Locker Move package

## Executive Summary

Phase 2 is materially stronger than the MVP baseline. The Move package now implements shared strike networks, the browser app builds cleanly, the dual-mode UI contract exists in code, and the unsafe local demo signer is gated to localnet full-detail mode. The main remaining audit risk is not a functional exploit identified in code review; it is release discipline around hosted deployment and the incomplete external-prover signoff.

## Findings

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| Medium | Hosted/in-game deployment is still a release risk because the code is ready before the owned-Utopia cutover path is proven. | [PHASE-2-IN-GAME-DEPLOYMENT.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md) documents a staged rollout; [vercel.json](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/vercel.json) provides hosting config, but we still lack a real owned Utopia storage unit and `F`-interaction proof. | Keep hosted deployment and owned-unit cutover as a separate release gate from local/testnet readiness. |
| Medium | External audit coverage is incomplete because the prover stage fails and the auditor CLI is Move-manifest oriented. | The deterministic Move scan reported 0 findings but exited non-zero on prover failure; the same CLI rejects the browser-app path because there is no `Move.toml`. | Treat the external Move scan as informative, not final signoff. Record the prover failure explicitly and use internal review for the offchain code until the auditor pipeline broadens. |
| Low | The unsafe local demo signer remains a sensitive path even though it is now scoped correctly. | The local demo signer is persisted in browser session storage and resolved in-browser, but it is now shown only in localnet full-detail mode. | Keep it localnet-only, never expose it on hosted Utopia routes, and avoid using non-local secrets. |

## Verification Notes

- `sui move test` passed with 13/13 tests.
- `pnpm build` passed.
- `pnpm locker:set-strike-network --dry-run` passed.
- The external auditor CLI executed deterministically against the Move package, but the scan remains incomplete because the prover stage failed.
- The sampled Utopia public object route resolves real assembly context, but that is a read-only context proof, not a Trust Locker deployment proof.

## Triage Order

1. Complete the owned-Utopia hosted cutover proof.
2. Resolve or explicitly accept the external prover-stage failure.
3. Keep the local demo signer isolated to localnet proof only.
4. Finish the remaining visual polish for the in-game mode.
