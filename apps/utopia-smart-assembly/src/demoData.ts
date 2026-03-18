import { DEFAULT_LOCKER_POLICY, findDefaultCatalogEntry, TRUST_LOCKER_CATALOG } from "./demoHelpers";
import type { LockerSnapshot } from "./models";

export function createDemoSnapshot(): LockerSnapshot {
  return {
    lockerName: "Cinder Commons Locker",
    lockerId: "0xTRUSTLOCKERLOCAL",
    trustStatus: DEFAULT_LOCKER_POLICY.isFrozen ? "frozen" : "mutable",
    owner: {
      label: "Cinder Caravan",
      canEditPolicy: !DEFAULT_LOCKER_POLICY.isFrozen,
      canFreezePolicy: !DEFAULT_LOCKER_POLICY.isFrozen,
      canEditSharedPenaltyPolicy: !DEFAULT_LOCKER_POLICY.isFrozen,
    },
    visitor: {
      relationshipBucket: "neutral",
      localStrikeCount: 1,
      localCooldownEndLabel: "No active cooldown",
      localCooldownActive: false,
      localCooldownEndTimestampMs: null,
    },
    sharedPenalty: {
      policy: {
        scopeId: 0,
        pricingPenaltyPerStrikeBps: 500,
        maxPricingPenaltyBps: 5000,
        lockoutStrikeThreshold: 3,
        networkLockoutDurationMs: 300000,
        isActive: false,
      },
      penalties: {
        strikeCount: 0,
        lastDeficitPoints: 0,
        networkCooldownEndTimestampMs: null,
        lastLockerId: "0xTRUSTLOCKERLOCAL",
      },
      pricingPenaltyBps: 0,
      lockoutActive: false,
      lockoutEndLabel: "No network lockout",
    },
    openInventory: [
      { ...findDefaultCatalogEntry(88070), quantity: 5 },
      { ...findDefaultCatalogEntry(1), quantity: 3 },
      { ...findDefaultCatalogEntry(448), quantity: 1 },
    ],
    visitorInventory: [
      { ...findDefaultCatalogEntry(88069), quantity: 12 },
      { ...findDefaultCatalogEntry(446), quantity: 4 },
      { ...findDefaultCatalogEntry(449), quantity: 2 },
    ],
    policy: DEFAULT_LOCKER_POLICY,
    recentSignals: [
      {
        type: "PolicyUpdated",
        digest: "demo-policy",
        summary: "Owner refreshed the locker policy and pricing table.",
      },
      {
        type: "StrikeIssued",
        digest: "demo-strike",
        summary: "An underpaying visitor was marked and placed on cooldown.",
      },
    ],
  };
}

export { TRUST_LOCKER_CATALOG };
