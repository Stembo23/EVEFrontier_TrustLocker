# Barter Box Launch Roadmap

This document is the canonical path from the current repo state to a functional, in-game, deployable Barter Box that an owner can configure and a visitor can use.

## Current Release State

- Localnet is working end to end for policy, stocking, fair trade, underpay, cooldown, and market-mode behavior.
- Hosted Cloudflare routing is working for:
  - `?view=full`
  - `?tenant=utopia&itemId=...&view=owner`
  - `?tenant=utopia&itemId=...&view=visitor`
- Hosted Utopia is currently `browser read-ready`, not `browser owner-ready`.
- The remaining blocker is operational, not architectural:
  - we still need one controlled Utopia storage unit running Barter Box with real inventory and live wallet-backed writes.

## Stage 1: Controlled Utopia Unit Preparation

Goal: establish one known-good live Utopia target for all remaining proof.

Tasks:
- obtain one owned or otherwise editable Utopia storage unit
- confirm edit permission for its custom URL
- authorize the Barter Box extension on that unit
- configure the unit against the live testnet package and extension config
- verify the unit resolves through:
  - `?tenant=utopia&itemId=<unit>&view=owner`
  - `?tenant=utopia&itemId=<unit>&view=visitor`
  - `?tenant=utopia&itemId=<unit>&view=full`

Acceptance:
- the exact unit is confirmed Barter Box-enabled
- hosted owner and visitor views resolve live state for that same unit
- the operator can print the exact owner/visitor/admin hosted URLs from:
  - `ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-handoff`

## Stage 2: Live Demo Inventory Provisioning

Goal: make the controlled unit actually testable.

Tasks:
- provision owner-side inventory into the same storage unit using the currently supported storage-unit inventory flow
- provision visitor-side inventory into the same storage unit using the same supported flow
- stock the public shelf with at least one meaningful offer set
- if procurement mode is in scope, create a path to generate non-empty `Claimable by owner`

Recommended baseline:
- one shelf-offered good with quantity greater than one
- one accepted-in-exchange good in visitor inventory
- one procurement scenario that produces claimable receipts

Acceptance:
- owner view shows real shelf stock
- visitor view shows real visitor inventory
- procurement mode can show non-empty `Claimable by owner`

## Stage 3: Hosted Browser Owner-Ready Validation

Goal: prove the Cloudflare app works as a live Utopia product.

Tasks:
- execute one hosted owner policy save on the controlled unit
- execute one hosted `Stock shelf`
- execute one hosted visitor trade
- in procurement mode, execute one hosted `Claim` or `Restock`
- capture screenshots and transaction digests for each

Acceptance:
- all actions succeed wallet-backed on hosted Cloudflare
- bottom-strip action feedback is correct for pending, success, error, and blocked states
- no localnet-only or debug-only copy leaks into `owner` or `visitor`
- any failure is captured with the exact runtime or platform blocker

Release rule:
- do not call the project `browser owner-ready` until this stage passes

## Stage 4: In-Game `F` Cutover

Goal: prove the real product path inside EVE Frontier.

Tasks:
- set the owned unit custom URL to the hosted Barter Box app
- default the in-game path to `view=visitor`
- verify `F` opens the hosted app with the live unit context
- verify the owner can switch into `owner` mode
- run one in-game visitor trade
- run one in-game owner action if supported by the live environment

Acceptance:
- `F` opens the correct live unit
- owner and visitor can both perform at least one meaningful action
- context binding works without manual URL editing

## Stage 5: Submission Freeze

Goal: convert the live-validated build into a defensible hackathon submission.

Tasks:
- run one more Move review focused on owner inventory movement and authorization
- run one more offchain/runtime review focused on hosted Utopia provider split and wallet-backed execution
- update proof docs with:
  - controlled Utopia unit flow
  - hosted browser evidence
  - in-game `F` evidence
  - known limitations
- freeze demo script and submission checklist

Acceptance:
- no open high-severity correctness issues
- proof docs match real behavior
- final demo path is reproducible without localnet

## Launch Assumptions

- Hackathon launch should target the current same-storage-unit inventory model.
- The provisioning bridge may still use the existing storage-unit inventory UX outside Barter Box unless broader game-inventory movement is proven quickly.
- `view=full` remains the technical/admin/debug surface even though the toolbar label is `Admin`.
- Procurement mode should remain in the submission narrative only if claim/restock is proven live on the controlled Utopia unit.
- Fuel fees remain deferred unless the visitor-side payment path is proven with hard evidence.
