# Barter Box Lane Briefs

Use these briefs as the starting prompt for Codex subagents or separate threads.

## Orchestrator / PM

- Read `/Users/anthony/Documents/EVE Frontier Smart Assemblies/AGENTS.md`
- Keep the Move package as the source of truth for locker policy and trade math
- Accept merges in this order:
  1. Move
  2. Scripts
  3. Frontend
  4. QA

## Move Lane

- Work only in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension`
- Preserve the current public types and event names unless the orchestrator approves a change
- Expand tests before changing trade semantics

## Scripts Lane

- Work only in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/scripts`
- Build localnet-first transaction helpers against the published Barter Box package
- Output deployment metadata to `deployments/localnet/trust-locker.json`

## Frontend Lane

- Work only in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/apps/utopia-smart-assembly/src`
- Keep `type_id` as the canonical item key
- Replace demo snapshot data with real localnet reads after deployment metadata exists
- Support browser-side owner policy writes and visitor trade execution in the submission path

## QA / Demo Lane

- Work only in `/Users/anthony/Documents/EVE Frontier Smart Assemblies/notes/trust-locker`
- Keep a living demo checklist
- Validate that the hackathon story matches the actual user flow
