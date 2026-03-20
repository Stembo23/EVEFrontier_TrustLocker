import type { CatalogItem, LockerPolicyDraft } from "../trust-locker.config";

export type UiMode = "full" | "owner" | "visitor";
export type RuntimeEnvironment = "localnet" | "utopia-browser" | "utopia-in-game";
export type CharacterResolutionStatus =
  | "none"
  | "single"
  | "multiple_needs_selection"
  | "owner_selected"
  | "visitor_selected";

export type RelationshipBucket = "friendly" | "neutral" | "rival";
export type LockerTrustStatus = "mutable" | "frozen";
export type LockerDataSource = "demo" | "assembly" | "localnet" | "utopia";

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
  showModeToggle: boolean;
  allowedViewModes: UiMode[];
  requestedViewMode: UiMode;
  effectiveViewMode: UiMode;
  ownerActionsEnabled: boolean;
  visitorActionsEnabled: boolean;
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

export type LockerInventoryItem = CatalogItem & { quantity: number };

export type LockerSnapshot = {
  lockerName: string;
  lockerId: string;
  trustStatus: LockerTrustStatus;
  fuelFeeSupported: boolean;
  owner: OwnerState;
  visitor: VisitorState;
  sharedPenalty: SharedPenaltyState;
  openInventory: LockerInventoryItem[];
  ownerReserveInventory: LockerInventoryItem[];
  ownerCargoInventory: LockerInventoryItem[];
  visitorInventory: LockerInventoryItem[];
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
  fuelFeeUnits: number;
  fuelFeeRequired: boolean;
  fuelFeeBlockedReason: string | null;
  willStrike: boolean;
};

export type LockerRecentSignal = {
  type: string;
  digest: string;
  summary: string;
};

export type LockerRuntimeContext = {
  network: "localnet" | "utopia";
  rpcUrl: string;
  tenant: string;
  lockerId: string;
  ownerCharacterId: string;
  visitorCharacterId: string | null;
  extensionConfigId: string;
  trustLockerPackageId: string;
  worldPackageId: string;
  defaultViewMode: UiMode;
};

export type WalletCharacterCandidate = {
  id: string;
  address: string;
  name: string;
  characterItemId: number;
  matchesOwner: boolean;
};

export type LockerIdentityState = {
  assemblyOwnerCharacterId: string;
  resolvedWalletCharacters: WalletCharacterCandidate[];
  selectedWalletCharacterId: string | null;
  isCurrentCharacterOwner: boolean;
  characterResolutionStatus: CharacterResolutionStatus;
};

export type LockerDataEnvelope = {
  snapshot: LockerSnapshot;
  source: LockerDataSource;
  notes: string[];
  runtime?: LockerRuntimeContext;
  runtimeEnvironment?: RuntimeEnvironment;
  capabilities?: UiCapabilities;
  identity?: LockerIdentityState;
};
