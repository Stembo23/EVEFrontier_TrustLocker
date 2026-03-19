import type { CatalogItem, LockerPolicyDraft } from "../trust-locker.config";

export type UiMode = "full" | "owner" | "visitor";
export type RuntimeEnvironment = "localnet" | "utopia-browser" | "utopia-in-game";

export type RelationshipBucket = "friendly" | "neutral" | "rival";
export type LockerTrustStatus = "mutable" | "frozen";
export type LockerDataSource = "demo" | "assembly" | "localnet";

export type StrikeNetworkPolicy = {
  scopeId: number;
  pricingPenaltyPerStrikeBps: number;
  maxPricingPenaltyBps: number;
  lockoutStrikeThreshold: number;
  networkLockoutDurationMs: number;
  isActive: boolean;
};

export type PersistentPenaltyState = {
  strikeCount: number;
  lastDeficitPoints: number;
  networkCooldownEndTimestampMs: number | null;
  lastLockerId: string;
};

export type SharedPenaltyState = {
  policy: StrikeNetworkPolicy;
  penalties: PersistentPenaltyState;
  pricingPenaltyBps: number;
  lockoutActive: boolean;
  lockoutEndLabel: string;
};

export type UiCapabilities = {
  showDemoSigner: boolean;
  showDiscovery: boolean;
  showSignals: boolean;
  showSupportCopy: boolean;
  showAdvancedOwnerControls: boolean;
  showLocalnetProofNotes: boolean;
  showActionStatusPanel: boolean;
  showVisitorWorkspace: boolean;
  showOwnerWorkspace: boolean;
  showGuidedFullFlow: boolean;
};

export type OwnerState = {
  label: string;
  canEditPolicy: boolean;
  canFreezePolicy: boolean;
  canEditSharedPenaltyPolicy: boolean;
};

export type VisitorState = {
  relationshipBucket: RelationshipBucket;
  localStrikeCount: number;
  localCooldownEndLabel: string;
  localCooldownActive: boolean;
  localCooldownEndTimestampMs?: number | null;
};

export type LockerSnapshot = {
  lockerName: string;
  lockerId: string;
  trustStatus: LockerTrustStatus;
  owner: OwnerState;
  visitor: VisitorState;
  sharedPenalty: SharedPenaltyState;
  openInventory: Array<CatalogItem & { quantity: number }>;
  visitorInventory: Array<CatalogItem & { quantity: number }>;
  policy: LockerPolicyDraft;
  recentSignals: LockerRecentSignal[];
};

export type TradePreview = {
  requestedItem: CatalogItem;
  requestedQuantity: number;
  offeredItem: CatalogItem;
  offeredQuantity: number;
  requestedPoints: number;
  baseRequestedPoints: number;
  effectiveRequestedPoints: number;
  offeredPoints: number;
  deficitPoints: number;
  pricingMultiplierBps: number;
  sharedPricingPenaltyBps: number;
  sharedPenaltyActive: boolean;
  sharedPenaltyScopeId: number;
  sharedPenaltyLockoutActive: boolean;
  sharedPenaltyLockoutLabel: string;
  willStrike: boolean;
};

export type LockerRecentSignal = {
  type: string;
  digest: string;
  summary: string;
};

export type LockerRuntimeContext = {
  network: "localnet";
  rpcUrl: string;
  tenant: string;
  lockerId: string;
  ownerCharacterId: string;
  visitorCharacterId: string;
  extensionConfigId: string;
  trustLockerPackageId: string;
  worldPackageId: string;
  defaultViewMode: UiMode;
};

export type LockerDataEnvelope = {
  snapshot: LockerSnapshot;
  source: LockerDataSource;
  notes: string[];
  runtime?: LockerRuntimeContext;
  runtimeEnvironment?: RuntimeEnvironment;
  capabilities?: UiCapabilities;
};
