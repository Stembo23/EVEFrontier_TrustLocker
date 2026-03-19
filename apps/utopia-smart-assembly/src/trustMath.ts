import type { CatalogItem, LockerPolicyDraft } from "../trust-locker.config";
import type { RelationshipBucket, SharedPenaltyState, TradePreview } from "./models";

const NEUTRAL_MULTIPLIER_BPS = 10_000;

export function findItemByTypeId(items: CatalogItem[], typeId: number): CatalogItem {
  const item = items.find((candidate) => candidate.typeId === typeId);
  if (!item) {
    throw new Error(`Unknown type_id ${typeId}`);
  }
  return item;
}

export function multiplierForBucket(
  policy: LockerPolicyDraft,
  bucket: RelationshipBucket,
): number {
  if (bucket === "friendly") return policy.friendlyMultiplierBps;
  if (bucket === "rival") return policy.rivalMultiplierBps;
  return NEUTRAL_MULTIPLIER_BPS;
}

export function quoteTradePreview(args: {
  policy: LockerPolicyDraft;
  relationshipBucket: RelationshipBucket;
  requestedItem: CatalogItem;
  requestedQuantity: number;
  offeredItem: CatalogItem;
  offeredQuantity: number;
  sharedPenalty: SharedPenaltyState;
}): TradePreview {
  const baseRequestedPoints =
    (args.requestedItem.points *
      args.requestedQuantity *
      multiplierForBucket(args.policy, args.relationshipBucket)) /
    NEUTRAL_MULTIPLIER_BPS;
  const effectiveRequestedPoints = Math.ceil(
    (baseRequestedPoints * (NEUTRAL_MULTIPLIER_BPS + args.sharedPenalty.pricingPenaltyBps)) /
      NEUTRAL_MULTIPLIER_BPS,
  );
  const offeredPoints = args.offeredItem.points * args.offeredQuantity;
  const deficitPoints = Math.max(0, effectiveRequestedPoints - offeredPoints);
  const pricingMultiplierBps = multiplierForBucket(args.policy, args.relationshipBucket);
  const fuelFeeUnits = Math.max(0, args.policy.fuelFeeUnits ?? 0);
  const fuelFeeRequired = fuelFeeUnits > 0;
  const fuelFeeBlockedReason = fuelFeeRequired
    ? "Fuel fees are configured but platform support is still deferred."
    : null;

  return {
    requestedItem: args.requestedItem,
    requestedQuantity: args.requestedQuantity,
    offeredItem: args.offeredItem,
    offeredQuantity: args.offeredQuantity,
    requestedPoints: effectiveRequestedPoints,
    baseRequestedPoints,
    effectiveRequestedPoints,
    offeredPoints,
    deficitPoints,
    pricingMultiplierBps,
    sharedPricingPenaltyBps: args.sharedPenalty.pricingPenaltyBps,
    sharedPenaltyActive:
      args.sharedPenalty.policy.isActive &&
      (args.sharedPenalty.pricingPenaltyBps > 0 || args.sharedPenalty.lockoutActive),
    sharedPenaltyScopeId: args.sharedPenalty.policy.scopeId,
    sharedPenaltyLockoutActive: args.sharedPenalty.lockoutActive,
    sharedPenaltyLockoutLabel: args.sharedPenalty.lockoutEndLabel,
    fuelFeeUnits,
    fuelFeeRequired,
    fuelFeeBlockedReason,
    willStrike: deficitPoints > 0,
  };
}
