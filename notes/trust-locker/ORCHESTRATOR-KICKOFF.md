# Trust Locker Orchestrator Kickoff

## Current Product Decision

Strikes are currently **per character per locker**, not global across the world.

- Character-level key: the visitor penalty state is stored by `character_id`
- Locker-level scope: the penalty state lives inside each locker policy
- Result: reputation follows a character only within an individual Trust Locker

## Why This Scope Is Right For MVP

- It keeps the mechanic legible and fair while players experiment with different locker policies
- It avoids accidental global punishment if many owners publish predatory lockers
- It preserves a clean future upgrade path to an optional global trust layer
- Submission readiness is a production-grade local/testnet demo plus honest Utopia read-only validation; live Utopia writes are stretch, not baseline
- Browser-side owner policy writes and visitor trade execution are part of the submission baseline

`Trust Locker` is also a placeholder name. All lanes should preserve current file/package identifiers unless the orchestrator explicitly approves a rename pass.

## Lane Launch Order

1. Move lane
2. Scripts lane
3. Frontend lane
4. QA lane

## Launch Prompt: Move Lane

Read:

- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/SUBAGENT-BRIEFS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension/sources/trust_locker.move`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension/tests/trust_locker_tests.move`

Task:

- expand the Move test suite to cover:
  - cooldown blocking a repeat trade
  - friendly vs rival bucket pricing quotes
  - overlap rejection between friendly and rival tribe lists
  - rejecting unaccepted requested/offered type_ids
- keep public interfaces stable unless you surface an orchestrator decision request first
- report back:
  - assumptions
  - any interface pressure
  - files changed
  - verification run

## Launch Prompt: Scripts Lane

Read:

- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/SUBAGENT-BRIEFS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/scripts/print-locker-context.ts`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension/sources/trust_locker.move`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/vendor/builder-scaffold/ts-scripts/utils/helper.ts`

Task:

- build localnet-first publish/configure helpers for Trust Locker
- target outputs:
  - `deployments/localnet/trust-locker.json`
  - script entrypoints for publish, authorize, configure, seed, fair-trade, dishonest-trade
- keep all work under `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/scripts`
- report back:
  - assumptions
  - runtime inputs needed
  - files changed
  - commands verified

## Launch Prompt: Frontend Lane

Read:

- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/SUBAGENT-BRIEFS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/src/App.tsx`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/trust-locker.config.ts`

Task:

- keep the current visual direction
- replace static assumptions with a data-provider boundary that can consume future localnet deployment metadata
- add clear owner/visitor sections, frozen/mutable trust signaling, and a better transaction preview model
- do not hardcode trade math outside the shared helper layer
- report back:
  - assumptions
  - files changed
  - build status

## Launch Prompt: QA Lane

Read:

- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/SUBAGENT-BRIEFS.md`
- `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker/STATUS.md`

Task:

- create:
  - a demo checklist
  - an acceptance checklist
  - a “story vs implementation” audit for the current MVP
- keep outputs in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker`
- report back:
  - risks
  - missing proof points
  - recommended next validation steps
