# Barter Box Post-Inventory Integration Audit

Date: 2026-03-30

Scope:

- owner inventory movement in the Move package
- wallet-backed stock / claim / restock runtime actions
- same-item trade invariant in Move and browser UI
- hosted Utopia runtime split
- identity and view gating in hosted Utopia

## Checks Run

- `pnpm build`
- `sui move test -e localnet --path move-contracts/trust_locker_extension`
- `pnpm test`
- targeted review of:
  - [`trust_locker.move`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/move-contracts/trust_locker_extension/sources/trust_locker.move)
  - [`liveLocalnet.ts`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/src/liveLocalnet.ts)
  - [`App.tsx`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/src/App.tsx)
  - [`lockerDataProvider.ts`](/Users/anthony/Documents/EVE%20Frontier%20Smart%20Assemblies/apps/utopia-smart-assembly/src/lockerDataProvider.ts)

## Findings

One correctness gap was identified and fixed in this pass:

- same-item trades were previously blocked only in the browser flow
- the Move `trade` entrypoint now aborts on identical requested and offered `type_id`

No remaining high-severity correctness findings were identified after remediation.

Confirmed:

- owner inventory mutations enforce storage-unit ownership in Move
- procurement-only claim and reserve-to-shelf restock are now explicit Move-level invariants
- browser stock/claim/restock actions borrow and return the expected owner caps
- same-item trades are now blocked both on-chain and in the browser flow
- hosted Utopia runtime remains explicitly separated from localnet/demo fallback
- identity resolution no longer guesses when multiple wallet characters exist
- in-game owner/non-owner view gating and browser read-only owner gating are covered by frontend tests

## Important Clarification

The current owner inventory model is still same-storage-unit scoped:

- `Items you are offering for trade` = owner character owned inventory inside the same unit
- `Claimable by owner` = storage unit owner slot used for procurement receipts
- `Restock from claimable` now moves receipts directly from owner reserve back to open inventory on-chain

This is coherent with the current launch plan, but it is narrower than a full game-global inventory UX.

## Remaining Audit Risk

The main remaining audit risk is operational:

- no controlled Utopia unit has yet proven hosted owner policy write
- no controlled Utopia unit has yet proven hosted stock / claim / restock / visitor trade
- no in-game `F` cutover proof exists yet on a controlled unit

## Conclusion

The code path looks ready for controlled Utopia validation.

The remaining release risk is live proof and cutover discipline, not an identified correctness bug in the newly reviewed owner inventory code.
