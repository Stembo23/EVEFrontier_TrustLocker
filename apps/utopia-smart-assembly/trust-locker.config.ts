export type CatalogItem = {
  typeId: number;
  label: string;
  tier: "basic" | "industrial" | "strategic";
  points: number;
  volumeM3: number;
  note: string;
};

export const PRODUCT_WORKING_NAME = "Barter Box";
export const LOCALNET_DEPLOYMENT_METADATA_URL = "/deployments/localnet/trust-locker.json";
export type MarketMode = "perpetual" | "procurement";

export type LockerPolicyDraft = {
  acceptedItems: CatalogItem[];
  friendlyTribes: number[];
  rivalTribes: number[];
  friendlyMultiplierBps: number;
  rivalMultiplierBps: number;
  marketMode: MarketMode;
  fuelFeeUnits: number;
  cooldownMs: number;
  strikeScopeId: number;
  useSharedPenalties: boolean;
  isActive: boolean;
  isFrozen: boolean;
};

export const TRUST_LOCKER_CATALOG: CatalogItem[] = [
  { typeId: 88069, label: "Ammo", tier: "basic", points: 1, volumeM3: 0.1, note: "Cheap but reliable exchange filler." },
  { typeId: 88070, label: "Lens", tier: "industrial", points: 2, volumeM3: 0.2, note: "Common fitting component for fair baseline swaps." },
  { typeId: 1, label: "Fuel Block", tier: "industrial", points: 3, volumeM3: 1.5, note: "Operational resource that keeps assemblies alive." },
  { typeId: 446, label: "Refined Ore", tier: "industrial", points: 4, volumeM3: 1.2, note: "Useful for builders and logistics crews." },
  { typeId: 447, label: "Repair Gel", tier: "strategic", points: 5, volumeM3: 0.4, note: "High-pressure support material for field recovery." },
  { typeId: 448, label: "Power Core", tier: "strategic", points: 6, volumeM3: 2.4, note: "Rare module component with real station value." },
  { typeId: 449, label: "Hull Plating", tier: "industrial", points: 3, volumeM3: 3.5, note: "Bulky but dependable defensive material." },
  { typeId: 450, label: "Nav Chip", tier: "strategic", points: 4, volumeM3: 0.15, note: "Small footprint, high strategic upside." }
];

export const DEFAULT_LOCKER_POLICY: LockerPolicyDraft = {
  acceptedItems: TRUST_LOCKER_CATALOG,
  friendlyTribes: [100],
  rivalTribes: [200],
  friendlyMultiplierBps: 9000,
  rivalMultiplierBps: 15000,
  marketMode: "perpetual",
  fuelFeeUnits: 0,
  cooldownMs: 60_000,
  strikeScopeId: 0,
  useSharedPenalties: false,
  isActive: true,
  isFrozen: false,
};
