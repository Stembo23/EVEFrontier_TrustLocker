# Trust Locker Phase 2 External Auditor Run

Date: 2026-03-18

Purpose: run the external auditor assistant against the Trust Locker codebase and capture what the current tool can and cannot sign off on.

## Invocation

Executed from the auditor app workspace with the built CLI:

```bash
cd /Users/anthony/Documents/First_Test_Project/apps/ai-auditor
node dist/apps/ai-auditor/src/cli.js scan --path "/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension" --out /tmp/trust-locker-phase2-audit-move --mode fail_on_high
```

Attempted offchain follow-up:

```bash
cd /Users/anthony/Documents/First_Test_Project/apps/ai-auditor
node dist/apps/ai-auditor/src/cli.js scan --path "/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/src" --out /tmp/trust-locker-phase2-audit-app --mode fail_on_high
```

## Result

- Move-package scan completed with `0` normalized findings.
- Static rules executed successfully.
- LLM triage was skipped because it was not configured.
- The mandatory prover stage failed, so the overall scan exited non-zero.
- Exit code: `20`
- Offchain/browser-app scan did not run because the CLI expects a Move manifest and rejected the `src` path with:
  - `Move manifest not found at .../src/Move.toml`

Key output:
- `scan complete: 0 findings`
- `gate: fail (exit=20)`
- `gate reason: Execution failure in mandatory pipeline stages (prover:failed).`

Generated Move-package artifacts:
- `/tmp/trust-locker-phase2-audit-move/audit-findings.json`
- `/tmp/trust-locker-phase2-audit-move/audit-findings.md`
- `/tmp/trust-locker-phase2-audit-move/audit-findings.sarif.json`
- `/tmp/trust-locker-phase2-audit-move/audit-findings.html`

## Interpretation

The external auditor pipeline is reachable and can scan the Trust Locker Move package, but this does not yet produce a clean external signoff because the prover stage fails before the run can be considered complete.

That means:
- the external integration path is real,
- the deterministic Move scan surface works,
- the prover failure must be tracked separately,
- the current CLI is not the right tool to directly scan the browser-app `src` tree,
- and the audit gate should remain open until the prover issue is resolved or explicitly accepted.

Open audit-gate items to carry forward:
- owned-Utopia cutover is still not proven
- hosted/public hardening is still a release gate, not a final signoff
- external prover failure remains unresolved
- offchain/browser review still relies on internal review and manual evidence until the auditor pipeline supports it

## Recommended Next Run

1. Re-run the Move-package scan after the prover failure is understood.
2. Track whether the prover failure is an environment issue or a package-level Move Prover configuration issue.
3. Keep the external audit report focused on Trust Locker Move unless the auditor pipeline adds a non-Move/offchain mode.
4. Use the internal audit as the primary offchain/browser security review until that happens.
