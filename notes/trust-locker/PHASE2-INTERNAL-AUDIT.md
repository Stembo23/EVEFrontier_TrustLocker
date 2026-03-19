# Barter Box Phase 2 Internal Audit Findings

Date: 2026-03-18

Scope: Barter Box Move package, browser dApp, local demo signer flow, hosted visitor/owner readiness surfaces, and Phase 2 coordination docs.

Method:
- Reviewed [AGENTS.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/AGENTS.md)
- Reviewed [README.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/README.md)
- Reviewed current Barter Box Move and offchain code paths
- Ran `sui move test` in the Move package directory
- Ran `pnpm build` in the app workspace
- Ran a deterministic external-auditor CLI scan against the Barter Box Move package

## Executive Summary

Phase 2 is materially stronger than the MVP baseline. The Move package now implements shared strike networks, the browser app builds cleanly, the three-view UI contract exists in code, and the unsafe local demo signer is gated to localnet full-detail mode. The main remaining audit risk is not a functional exploit identified in code review; it is release discipline around Utopia hardening/cutover and the incomplete external-prover signoff.
The new owner-incentive documents also record a Fuel-fee no-go/deferred decision so the product narrative does not claim a payment path that the repo does not yet prove.

## Findings

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| Medium | Utopia public hardening is complete enough for read-only context validation, but the owned-unit cutover is still unproven. | [PHASE-2-IN-GAME-DEPLOYMENT.md](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/notes/trust-locker/PHASE-2-IN-GAME-DEPLOYMENT.md) now separates Utopia public hardening from owned-unit cutover; we still lack a real owned Utopia storage unit and `F`-interaction proof. | Keep owned-unit cutover as the final Utopia release gate. |
| Medium | External audit coverage is incomplete because the prover stage fails and the auditor CLI is Move-manifest oriented. | The deterministic Move scan reported 0 findings but exited non-zero on prover failure; the same CLI rejects the browser-app path because there is no `Move.toml`. | Treat the external Move scan as informative, not final signoff. Record the prover failure explicitly and use internal review for the offchain code until the auditor pipeline broadens. |
| Low | The unsafe local demo signer remains a sensitive path even though it is now scoped correctly. | The local demo signer is persisted in browser session storage and resolved in-browser, but it is now shown only in localnet full-detail mode. | Keep it localnet-only, never expose it on hosted Utopia routes, and avoid using non-local secrets. |
| Low | Fuel-fee support is currently a deferred product dependency, not a live mechanic. | The repo does not prove a visitor-side Fuel debit and owner-controlled credit path, so the docs now record the Fuel fee as deferred and the fallback owner-incentive model as `perpetual_market` / `procurement_market`. | Do not describe Fuel-fee trading as implemented until the world contracts prove the debit/credit path. |

## Verification Notes

- `sui move test` passed with 13/13 tests.
- `pnpm build` passes at head.
- `pnpm locker:set-strike-network --dry-run` passed.
- The external auditor CLI executed deterministically against the Move package, but the scan remains incomplete because the prover stage failed.
- The sampled Utopia public object route resolves real assembly context, but that is a read-only context proof, not a Barter Box deployment proof.

## Triage Order

1. Complete the owned-Utopia hosted cutover proof.
2. Resolve or explicitly accept the external prover-stage failure.
3. Keep the local demo signer isolated to localnet proof only.
4. Finish the remaining visual polish for the visitor and owner modes.
5. Keep the owner-incentive docs aligned with the no-go Fuel-fee result and the market-mode fallback.
