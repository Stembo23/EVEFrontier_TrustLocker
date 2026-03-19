import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { deriveObjectID } from "@mysten/sui/utils";
import type { CatalogItem, LockerPolicyDraft, MarketMode } from "../trust-locker.config";
import deployment from "../deployments/localnet/trust-locker.json";
import { TRUST_LOCKER_CATALOG } from "../trust-locker.config";
import { createDemoSnapshot } from "./demoData";
import type {
  LockerDataEnvelope,
  LockerRecentSignal,
  LockerRuntimeContext,
  LockerSnapshot,
  RelationshipBucket,
} from "./models";

type DeploymentMetadata = typeof deployment;

export type WalletTxExecutor = (args: {
  transaction: Transaction;
  options?: Record<string, unknown>;
}) => Promise<unknown>;

type PolicyField = {
  accepted_items?: Array<{
    fields?: {
      type_id?: string | number;
      base_points_per_unit?: string | number;
    };
  }>;
  friendly_tribes?: Array<string | number>;
  rival_tribes?: Array<string | number>;
  friendly_multiplier_bps?: string | number;
  rival_multiplier_bps?: string | number;
  market_mode?: string | number;
  fuel_fee_units?: string | number;
  strike_scope_id?: string | number;
  use_shared_penalties?: boolean;
  cooldown_ms?: string | number;
  is_active?: boolean;
};

type SharedStrikeNetworkPolicyField = {
  scope_id?: string | number;
  pricing_penalty_per_strike_bps?: string | number;
  max_pricing_penalty_bps?: string | number;
  lockout_strike_threshold?: string | number;
  network_lockout_duration_ms?: string | number;
  is_active?: boolean;
};

type InventoryEntry = {
  typeId: number;
  quantity: number;
};

const DEFAULT_SENDER = "0x0000000000000000000000000000000000000000000000000000000000000000";

const TenantItemId = bcs.struct("TenantItemId", {
  id: bcs.u64(),
  tenant: bcs.string(),
});

const StrikeNetworkPolicyBcs = bcs.struct("StrikeNetworkPolicy", {
  scope_id: bcs.u64(),
  pricing_penalty_per_strike_bps: bcs.u64(),
  max_pricing_penalty_bps: bcs.u64(),
  lockout_strike_threshold: bcs.u64(),
  network_lockout_duration_ms: bcs.u64(),
  is_active: bcs.bool(),
});

const MOVE_MARKET_MODE_PERPETUAL = 0;
const MOVE_MARKET_MODE_PROCUREMENT = 1;

function parseMarketMode(value: string | number | undefined): MarketMode {
  return toNumber(value, MOVE_MARKET_MODE_PERPETUAL) === MOVE_MARKET_MODE_PROCUREMENT
    ? "procurement"
    : "perpetual";
}

function encodeMarketMode(mode: MarketMode): number {
  return mode === "procurement" ? MOVE_MARKET_MODE_PROCUREMENT : MOVE_MARKET_MODE_PERPETUAL;
}

function createLocalnetClient(metadata: DeploymentMetadata): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: metadata.rpcUrl, network: "localnet" });
}

function buildEd25519Keypair(secretKey: string): Ed25519Keypair {
  const { scheme, secretKey: decodedSecretKey } = decodeSuiPrivateKey(secretKey.trim());
  if (scheme !== "ED25519") {
    throw new Error("Barter Box local demo signer requires an ED25519 `suiprivkey...` secret.");
  }
  return Ed25519Keypair.fromSecretKey(decodedSecretKey);
}

export function deriveSuiAddressFromPrivateKey(secretKey: string): string {
  return buildEd25519Keypair(secretKey).toSuiAddress();
}

export function createLocalDemoSignerExecutor(secretKey: string): {
  address: string;
  signAndExecuteTransaction: WalletTxExecutor;
} {
  const keypair = buildEd25519Keypair(secretKey);
  const client = createLocalnetClient(deployment);

  return {
    address: keypair.toSuiAddress(),
    signAndExecuteTransaction: async ({ transaction, options }) => {
      transaction.setSenderIfNotSet(keypair.toSuiAddress());
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction,
        options: {
          ...buildExecutionOptions(),
          ...(options ?? {}),
        },
      });

      const digest = extractTransactionDigest(result);
      await client.waitForTransaction({ digest });
      return result;
    },
  };
}

function normalizeId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("0x")) return `0x${trimmed}`;
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getMoveObjectFields(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const directFields = asRecord(record.fields);
  if (directFields) return directFields;
  return record;
}

function getDynamicFieldValueFields(value: unknown): Record<string, unknown> | null {
  const contentFields = getMoveObjectFields(value);
  const nestedValue = asRecord(contentFields?.value);
  const nestedValueFields = getMoveObjectFields(nestedValue);
  return nestedValueFields ?? contentFields;
}

function extractContents(value: unknown): unknown[] {
  const record = asRecord(value);
  if (!record) return [];
  const contents = record.contents;
  if (Array.isArray(contents)) return contents;
  const nestedFields = asRecord(record.fields);
  const nestedContents = nestedFields?.contents;
  return Array.isArray(nestedContents) ? nestedContents : [];
}

function parseBool(bytes: Uint8Array | null | undefined): boolean | null {
  if (!bytes) return null;
  return bcs.bool().parse(bytes);
}

function parseU64(bytes: Uint8Array | null | undefined): bigint | null {
  if (!bytes) return null;
  return BigInt(bcs.u64().parse(bytes));
}

function parseU32(bytes: Uint8Array | null | undefined): number | null {
  if (!bytes) return null;
  return Number(bcs.u32().parse(bytes));
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
}

function findCatalogItem(typeId: number, pointsOverride?: number): CatalogItem {
  const item = TRUST_LOCKER_CATALOG.find((candidate) => candidate.typeId === typeId);
  if (!item) {
    return {
      typeId,
      label: `type_id ${typeId}`,
      tier: "basic",
      points: pointsOverride ?? 1,
      volumeM3: 1,
      note: "No curated label for this item yet.",
    };
  }

  return {
    ...item,
    points: pointsOverride ?? item.points,
  };
}

function relationshipBucketForTribe(
  tribe: number,
  friendlyTribes: number[],
  rivalTribes: number[],
): RelationshipBucket {
  if (friendlyTribes.includes(tribe)) return "friendly";
  if (rivalTribes.includes(tribe)) return "rival";
  return "neutral";
}

function formatCooldownLabel(cooldownEndTimestampMs: bigint | null): string {
  if (!cooldownEndTimestampMs || cooldownEndTimestampMs <= 0n) return "No active cooldown";
  const cooldownEnd = Number(cooldownEndTimestampMs);
  const delta = cooldownEnd - Date.now();
  if (delta <= 0) return "Cooldown expired";
  const seconds = Math.ceil(delta / 1000);
  return `${seconds}s remaining`;
}

function deriveWorldObjectId(
  objectRegistryId: string,
  itemId: bigint,
  worldPackageId: string,
  tenant: string,
): string {
  const keyBytes = TenantItemId.serialize({ id: itemId, tenant }).toBytes();
  const keyTypeTag = `${worldPackageId}::in_game_id::TenantItemId`;
  return deriveObjectID(objectRegistryId, keyTypeTag, keyBytes);
}

function buildRuntimeContext(metadata: DeploymentMetadata): LockerRuntimeContext {
  return {
    network: "localnet",
    rpcUrl: metadata.rpcUrl,
    tenant: metadata.tenant,
    lockerId: deriveWorldObjectId(
      metadata.world.objectRegistry,
      BigInt(metadata.defaults.storageUnitItemId),
      metadata.world.packageId,
      metadata.tenant,
    ),
    ownerCharacterId: deriveWorldObjectId(
      metadata.world.objectRegistry,
      BigInt(metadata.defaults.ownerCharacterItemId),
      metadata.world.packageId,
      metadata.tenant,
    ),
    visitorCharacterId: deriveWorldObjectId(
      metadata.world.objectRegistry,
      BigInt(metadata.defaults.visitorCharacterItemId),
      metadata.world.packageId,
      metadata.tenant,
    ),
    extensionConfigId: metadata.trustLocker.extensionConfigId,
    trustLockerPackageId: metadata.trustLocker.packageId,
    worldPackageId: metadata.world.packageId,
    defaultViewMode: "full",
  };
}

function defaultSharedStrikeNetworkPolicy(scopeId = 0) {
  return {
    scopeId,
    pricingPenaltyPerStrikeBps: 500,
    maxPricingPenaltyBps: 5000,
    lockoutStrikeThreshold: 3,
    networkLockoutDurationMs: 300000,
    isActive: false,
  };
}

function buildBaseSnapshot(metadata: DeploymentMetadata): LockerSnapshot {
  const policyItems = Array.from(
    new Set([metadata.defaults.requestedTypeId, metadata.defaults.offeredTypeId]),
  ).map((typeId) => findCatalogItem(typeId, 10));

  return {
    lockerName: "Localnet Barter Box",
    lockerId: buildRuntimeContext(metadata).lockerId,
    trustStatus: "mutable",
    owner: {
      label: `${metadata.defaults.ownerCharacterItemId} owner`,
      canEditPolicy: true,
      canFreezePolicy: true,
      canEditSharedPenaltyPolicy: true,
    },
    visitor: {
      relationshipBucket: "neutral",
      localStrikeCount: 0,
      localCooldownEndLabel: "No active cooldown",
      localCooldownActive: false,
      localCooldownEndTimestampMs: null,
    },
    sharedPenalty: {
      policy: defaultSharedStrikeNetworkPolicy(),
      penalties: {
        strikeCount: 0,
        lastDeficitPoints: 0,
        networkCooldownEndTimestampMs: null,
        lastLockerId: buildRuntimeContext(metadata).lockerId,
      },
      pricingPenaltyBps: 0,
    lockoutActive: false,
    lockoutEndLabel: "No network lockout",
    },
    openInventory: policyItems.map((item) => ({ ...item, quantity: 0 })),
    ownerReserveInventory: policyItems.map((item) => ({ ...item, quantity: 0 })),
    visitorInventory: policyItems.map((item) => ({ ...item, quantity: 0 })),
    fuelFeeSupported: false,
    policy: {
      acceptedItems: policyItems,
      friendlyTribes: metadata.defaults.friendlyTribes,
      rivalTribes: metadata.defaults.rivalTribes,
      friendlyMultiplierBps: metadata.defaults.friendlyMultiplierBps,
      rivalMultiplierBps: metadata.defaults.rivalMultiplierBps,
      marketMode: "perpetual",
      fuelFeeUnits: 0,
      cooldownMs: metadata.defaults.cooldownMs,
      strikeScopeId: 0,
      useSharedPenalties: false,
      isActive: metadata.defaults.isActive,
      isFrozen: false,
    },
    recentSignals: [],
  };
}

async function devInspectBytes(
  client: SuiJsonRpcClient,
  senderAddress: string,
  target: string,
  args: (tx: Transaction) => unknown[],
): Promise<Uint8Array | null> {
  const tx = new Transaction();
  tx.moveCall({
    target,
    arguments: args(tx) as never,
  });

  const result = await client.devInspectTransactionBlock({
    sender: senderAddress,
    transactionBlock: tx,
  });

  const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
  return bytes ? new Uint8Array(bytes) : null;
}

async function loadObjectRef(client: SuiJsonRpcClient, objectId: string) {
  const response = await client.getObject({
    id: objectId,
    options: { showOwner: true, showType: true },
  });
  const data = response.data;
  if (!data?.digest || data.version == null) {
    throw new Error(`Could not resolve object ref for ${objectId}`);
  }
  return {
    objectId,
    version: String(data.version),
    digest: data.digest,
  };
}

async function readPolicyField(
  client: SuiJsonRpcClient,
  extensionConfigId: string,
): Promise<PolicyField | null> {
  const fields = await client.getDynamicFields({
    parentId: extensionConfigId,
    limit: 50,
  });
  const field = fields.data.find((entry) =>
    String(entry.objectType ?? "").endsWith("::trust_locker::LockerPolicy"),
  );
  if (!field) return null;

  const object = await client.getDynamicFieldObject({
    parentId: extensionConfigId,
    name: field.name,
  });

  const content = object.data?.content;
  const valueFields = getDynamicFieldValueFields(content);
  return (valueFields as PolicyField | null) ?? null;
}

async function readSharedStrikeNetworkPolicy(
  client: SuiJsonRpcClient,
  runtime: LockerRuntimeContext,
  senderAddress: string,
  strikeScopeId: number,
): Promise<SharedStrikeNetworkPolicyField | null> {
  if (strikeScopeId <= 0) return null;

  const hasNetworkBytes = await devInspectBytes(
    client,
    senderAddress,
    `${runtime.trustLockerPackageId}::trust_locker::has_strike_network`,
    (tx) => [tx.object(runtime.extensionConfigId), tx.pure.u64(BigInt(strikeScopeId))],
  );
  if (!parseBool(hasNetworkBytes)) {
    return null;
  }

  const policyBytes = await devInspectBytes(
    client,
    senderAddress,
    `${runtime.trustLockerPackageId}::trust_locker::strike_network_policy`,
    (tx) => [tx.object(runtime.extensionConfigId), tx.pure.u64(BigInt(strikeScopeId))],
  );
  if (!policyBytes) return null;

  const policy = StrikeNetworkPolicyBcs.parse(policyBytes);
  return {
    scope_id: policy.scope_id.toString(),
    pricing_penalty_per_strike_bps: policy.pricing_penalty_per_strike_bps.toString(),
    max_pricing_penalty_bps: policy.max_pricing_penalty_bps.toString(),
    lockout_strike_threshold: policy.lockout_strike_threshold.toString(),
    network_lockout_duration_ms: policy.network_lockout_duration_ms.toString(),
    is_active: policy.is_active,
  };
}

function parseInventoryEntriesFromField(value: unknown): InventoryEntry[] {
  const valueFields = getDynamicFieldValueFields(value);
  const itemsContents = extractContents(asRecord(valueFields?.items) ?? valueFields?.items);

  return itemsContents
    .map((entry) => {
      const record = asRecord(entry);
      const itemValue = getDynamicFieldValueFields(record?.value ?? record?.fields);
      if (!itemValue) return null;
      const typeId = toNumber(itemValue.type_id ?? record?.key, 0);
      const quantity = toNumber(itemValue.quantity, 0);
      if (!typeId || quantity < 0) return null;
      return { typeId, quantity };
    })
    .filter((entry): entry is InventoryEntry => Boolean(entry));
}

async function loadInventoryEntries(
  client: SuiJsonRpcClient,
  lockerId: string,
  inventoryKeyId: string,
): Promise<InventoryEntry[]> {
  const fields = await client.getDynamicFields({
    parentId: lockerId,
    limit: 100,
  });
  const field = fields.data.find((entry) => {
    const nameRecord = asRecord(entry.name);
    const value = nameRecord?.value;
    return typeof value === "string" && normalizeId(value) === normalizeId(inventoryKeyId);
  });

  if (!field) return [];

  const object = await client.getObject({
    id: field.objectId,
    options: { showContent: true },
  });

  return parseInventoryEntriesFromField(object.data?.content);
}

function summarizeParsedJson(parsedJson?: Record<string, unknown>): string {
  if (!parsedJson) return "No parsed event payload.";
  const typeId = parsedJson.requested_type_id ?? parsedJson.type_id;
  const qty = parsedJson.requested_quantity ?? parsedJson.quantity;
  const deficit = parsedJson.deficit_points;
  const strike = parsedJson.strike_count;

  const parts: string[] = [];
  if (typeId !== undefined) parts.push(`type_id ${String(typeId)}`);
  if (qty !== undefined) parts.push(`qty ${String(qty)}`);
  if (deficit !== undefined) parts.push(`deficit ${String(deficit)}`);
  if (strike !== undefined) parts.push(`strikes ${String(strike)}`);
  return parts.join(" | ") || "No parsed event payload.";
}

async function loadRecentSignals(
  client: SuiJsonRpcClient,
  packageId: string,
): Promise<LockerRecentSignal[]> {
  const response = await client.queryEvents({
    query: {
      MoveModule: {
        package: packageId,
        module: "trust_locker",
      },
    },
    limit: 6,
    order: "descending",
  });

  return (response.data ?? []).map((event) => ({
    type: String(event.type ?? "unknown").split("::").pop() ?? "unknown",
    digest: event.id?.txDigest ?? "unknown",
    summary: summarizeParsedJson(event.parsedJson as Record<string, unknown> | undefined),
  }));
}

function buildPolicyDraft(policy: PolicyField | null, metadata: DeploymentMetadata): LockerPolicyDraft {
  if (!policy) {
    return buildBaseSnapshot(metadata).policy;
  }

  const acceptedItems = (policy.accepted_items ?? []).map((rule) => {
    const typeId = toNumber(rule.fields?.type_id, 0);
    const points = toNumber(rule.fields?.base_points_per_unit, 1);
    return findCatalogItem(typeId, points);
  });

  return {
    acceptedItems: acceptedItems.length > 0 ? acceptedItems : buildBaseSnapshot(metadata).policy.acceptedItems,
    friendlyTribes: toNumberArray(policy.friendly_tribes),
    rivalTribes: toNumberArray(policy.rival_tribes),
    friendlyMultiplierBps: toNumber(policy.friendly_multiplier_bps, metadata.defaults.friendlyMultiplierBps),
    rivalMultiplierBps: toNumber(policy.rival_multiplier_bps, metadata.defaults.rivalMultiplierBps),
    marketMode: parseMarketMode(policy.market_mode),
    fuelFeeUnits: toNumber(policy.fuel_fee_units, 0),
    cooldownMs: toNumber(policy.cooldown_ms, metadata.defaults.cooldownMs),
    strikeScopeId: toNumber(policy.strike_scope_id, 0),
    useSharedPenalties: Boolean(policy.use_shared_penalties),
    isActive: policy.is_active ?? metadata.defaults.isActive,
    isFrozen: false,
  };
}

function materializeInventory(
  entries: InventoryEntry[],
  policy: LockerPolicyDraft,
): Array<CatalogItem & { quantity: number }> {
  const pointsByTypeId = new Map(policy.acceptedItems.map((item) => [item.typeId, item.points]));

  return entries.map((entry) => ({
    ...findCatalogItem(entry.typeId, pointsByTypeId.get(entry.typeId)),
    quantity: entry.quantity,
  }));
}

async function tryLoadLocalnetSnapshot(
  metadata: DeploymentMetadata,
  senderAddress?: string,
): Promise<{ snapshot: LockerSnapshot; notes: string[]; runtime: LockerRuntimeContext }> {
  const notes: string[] = [];
  const client = createLocalnetClient(metadata);
  const runtime = buildRuntimeContext(metadata);
  const walletSender = senderAddress || DEFAULT_SENDER;

  const [
    policy,
    frozenBytes,
    strikeCountBytes,
    cooldownBytes,
    visitorTribeBytes,
    openStorageKeyBytes,
    storageOwnerCapBytes,
    visitorOwnerCapBytes,
    recentSignals,
  ] = await Promise.all([
    readPolicyField(client, runtime.extensionConfigId),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.worldPackageId}::storage_unit::is_extension_frozen`,
      (tx) => [tx.object(runtime.lockerId)],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.trustLockerPackageId}::trust_locker::strike_count`,
      (tx) => [
        tx.object(runtime.extensionConfigId),
        tx.object(runtime.lockerId),
        tx.object(runtime.visitorCharacterId),
      ],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.trustLockerPackageId}::trust_locker::cooldown_end_timestamp_ms`,
      (tx) => [
        tx.object(runtime.extensionConfigId),
        tx.object(runtime.lockerId),
        tx.object(runtime.visitorCharacterId),
      ],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.worldPackageId}::character::tribe`,
      (tx) => [tx.object(runtime.visitorCharacterId)],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.worldPackageId}::storage_unit::open_storage_key`,
      (tx) => [tx.object(runtime.lockerId)],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.worldPackageId}::storage_unit::owner_cap_id`,
      (tx) => [tx.object(runtime.lockerId)],
    ),
    devInspectBytes(
      client,
      walletSender,
      `${runtime.worldPackageId}::character::owner_cap_id`,
      (tx) => [tx.object(runtime.visitorCharacterId)],
    ),
    loadRecentSignals(client, runtime.trustLockerPackageId),
  ]);

  const openStorageKey = openStorageKeyBytes ? bcs.Address.parse(openStorageKeyBytes) : null;
  const storageOwnerCapId = storageOwnerCapBytes ? bcs.Address.parse(storageOwnerCapBytes) : null;
  const visitorOwnerCapId = visitorOwnerCapBytes ? bcs.Address.parse(visitorOwnerCapBytes) : null;

  const [openInventoryEntries, ownerReserveEntries, visitorInventoryEntries] = await Promise.all([
    openStorageKey ? loadInventoryEntries(client, runtime.lockerId, openStorageKey) : Promise.resolve([]),
    storageOwnerCapId ? loadInventoryEntries(client, runtime.lockerId, storageOwnerCapId) : Promise.resolve([]),
    visitorOwnerCapId ? loadInventoryEntries(client, runtime.lockerId, visitorOwnerCapId) : Promise.resolve([]),
  ]);

  const policyDraft = buildPolicyDraft(policy, metadata);
  const [sharedStrikeCountBytes, sharedCooldownBytes, sharedPricingPenaltyBpsBytes, sharedPolicy] =
    policyDraft.strikeScopeId > 0
      ? await Promise.all([
          devInspectBytes(
            client,
            walletSender,
            `${runtime.trustLockerPackageId}::trust_locker::shared_strike_count`,
            (tx) => [
              tx.object(runtime.extensionConfigId),
              tx.pure.u64(BigInt(policyDraft.strikeScopeId)),
              tx.object(runtime.visitorCharacterId),
            ],
          ),
          devInspectBytes(
            client,
            walletSender,
            `${runtime.trustLockerPackageId}::trust_locker::shared_cooldown_end_timestamp_ms`,
            (tx) => [
              tx.object(runtime.extensionConfigId),
              tx.pure.u64(BigInt(policyDraft.strikeScopeId)),
              tx.object(runtime.visitorCharacterId),
            ],
          ),
          devInspectBytes(
            client,
            walletSender,
            `${runtime.trustLockerPackageId}::trust_locker::shared_pricing_penalty_bps`,
            (tx) => [
              tx.object(runtime.extensionConfigId),
              tx.pure.u64(BigInt(policyDraft.strikeScopeId)),
              tx.object(runtime.visitorCharacterId),
            ],
          ),
          readSharedStrikeNetworkPolicy(
            client,
            runtime,
            walletSender,
            policyDraft.strikeScopeId,
          ),
        ])
      : [null, null, null, null];
  const isFrozen = parseBool(frozenBytes) ?? false;
  const visitorTribe = parseU32(visitorTribeBytes);
  const bucket = visitorTribe == null
    ? "neutral"
    : relationshipBucketForTribe(
        visitorTribe,
        policyDraft.friendlyTribes,
        policyDraft.rivalTribes,
      );
  const cooldownEndTimestampMs = parseU64(cooldownBytes);
  const cooldownEndNumber = cooldownEndTimestampMs ? Number(cooldownEndTimestampMs) : null;
  const localStrikeCount = Number(parseU64(strikeCountBytes) ?? 0n);
  const sharedStrikeCount = Number(parseU64(sharedStrikeCountBytes) ?? 0n);
  const sharedCooldownEndTimestampMs = parseU64(sharedCooldownBytes);
  const sharedCooldownEndNumber = sharedCooldownEndTimestampMs
    ? Number(sharedCooldownEndTimestampMs)
    : null;
  const sharedPricingPenaltyBps = Number(parseU64(sharedPricingPenaltyBpsBytes) ?? 0n);

  const snapshot: LockerSnapshot = {
    lockerName: "Localnet Barter Box",
    lockerId: runtime.lockerId,
    trustStatus: isFrozen ? "frozen" : "mutable",
    fuelFeeSupported: false,
    owner: {
      label: `${metadata.defaults.ownerCharacterItemId} owner`,
      canEditPolicy: !isFrozen,
      canFreezePolicy: !isFrozen,
      canEditSharedPenaltyPolicy: !isFrozen,
    },
    visitor: {
      relationshipBucket: bucket,
      localStrikeCount,
      localCooldownEndLabel: formatCooldownLabel(cooldownEndTimestampMs),
      localCooldownActive: Boolean(cooldownEndTimestampMs && cooldownEndTimestampMs > BigInt(Date.now())),
      localCooldownEndTimestampMs: cooldownEndNumber,
    },
    sharedPenalty: {
      policy: sharedPolicy
        ? {
            scopeId: toNumber(sharedPolicy.scope_id, policyDraft.strikeScopeId),
            pricingPenaltyPerStrikeBps: toNumber(
              sharedPolicy.pricing_penalty_per_strike_bps,
              defaultSharedStrikeNetworkPolicy(policyDraft.strikeScopeId).pricingPenaltyPerStrikeBps,
            ),
            maxPricingPenaltyBps: toNumber(
              sharedPolicy.max_pricing_penalty_bps,
              defaultSharedStrikeNetworkPolicy(policyDraft.strikeScopeId).maxPricingPenaltyBps,
            ),
            lockoutStrikeThreshold: toNumber(
              sharedPolicy.lockout_strike_threshold,
              defaultSharedStrikeNetworkPolicy(policyDraft.strikeScopeId).lockoutStrikeThreshold,
            ),
            networkLockoutDurationMs: toNumber(
              sharedPolicy.network_lockout_duration_ms,
              defaultSharedStrikeNetworkPolicy(policyDraft.strikeScopeId).networkLockoutDurationMs,
            ),
            isActive: Boolean(sharedPolicy.is_active),
          }
        : {
            ...defaultSharedStrikeNetworkPolicy(policyDraft.strikeScopeId),
            isActive: policyDraft.useSharedPenalties,
          },
      penalties: {
        strikeCount: sharedStrikeCount,
        lastDeficitPoints: 0,
        networkCooldownEndTimestampMs: sharedCooldownEndNumber,
        lastLockerId: runtime.lockerId,
      },
      pricingPenaltyBps: sharedPricingPenaltyBps,
      lockoutActive: Boolean(
        sharedCooldownEndTimestampMs && sharedCooldownEndTimestampMs > BigInt(Date.now()),
      ),
      lockoutEndLabel: formatCooldownLabel(sharedCooldownEndTimestampMs),
    },
    openInventory: materializeInventory(openInventoryEntries, policyDraft),
    ownerReserveInventory: materializeInventory(ownerReserveEntries, policyDraft),
    visitorInventory: materializeInventory(visitorInventoryEntries, policyDraft),
    policy: {
      ...policyDraft,
      isFrozen,
    },
    recentSignals,
  };

  notes.push("Localnet deployment metadata loaded from the published Barter Box JSON.");
  notes.push("Live chain reads verified for policy, trust state, visitor penalty state, and inventory balances.");
  notes.push("Browser write actions target the same owner-cap and trade entrypoints as the local scripts.");
  if (snapshot.openInventory.length === 0) {
    notes.push("Open inventory is currently empty or unavailable from the live locker state.");
  }
  if (snapshot.visitorInventory.length === 0) {
    notes.push("Visitor owned inventory is currently empty or unavailable from the live locker state.");
  }
  if (snapshot.policy.fuelFeeUnits > 0 && !snapshot.fuelFeeSupported) {
    notes.push("Fuel fee is configured in policy draft terms, but real Fuel charging is deferred pending world-contract support.");
  }
  if (snapshot.policy.marketMode === "procurement") {
    notes.push("Procurement mode routes visitor-offered goods into the owner's reserve inventory inside the same unit.");
  }

  return { snapshot, notes, runtime };
}

export async function resolveLocalnetLockerSnapshot(
  assemblyId?: string,
  assemblyName?: string,
  senderAddress?: string,
): Promise<LockerDataEnvelope> {
  let snapshot = createDemoSnapshot();
  const notes: string[] = [];
  let runtime: LockerRuntimeContext | undefined;

  try {
    const live = await tryLoadLocalnetSnapshot(deployment, senderAddress);
    snapshot = live.snapshot;
    notes.push(...live.notes);
    runtime = live.runtime;
  } catch (error) {
    notes.push(
      `Localnet chain read failed; falling back to the curated demo snapshot. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (assemblyId || assemblyName) {
    snapshot = {
      ...snapshot,
      lockerId: assemblyId || snapshot.lockerId,
      lockerName: assemblyName || snapshot.lockerName,
    };
    notes.push("Assembly context applied from the selected smart object.");
  }

  return {
    snapshot,
    source: "localnet",
    notes,
    runtime,
  };
}

function buildExecutionOptions() {
  return {
    showEffects: true,
    showEvents: true,
    showObjectChanges: true,
  };
}

function extractTransactionDigest(result: unknown): string {
  const record = asRecord(result);
  if (record?.$kind === "FailedTransaction") {
    const failedRecord = asRecord(record.FailedTransaction);
    const status = asRecord(failedRecord?.status);
    const error = asRecord(status?.error);
    const message = typeof error?.message === "string"
      ? error.message
      : "Transaction failed without a detailed error message.";
    throw new Error(message);
  }

  if (record?.$kind === "Transaction") {
    const successRecord = asRecord(record.Transaction);
    if (typeof successRecord?.digest === "string") {
      return successRecord.digest;
    }
  }

  if (typeof record?.digest === "string") {
    return record.digest;
  }

  const success = asRecord(record?.Transaction);
  if (typeof success?.digest === "string") {
    return success.digest;
  }

  const failed = asRecord(record?.FailedTransaction);
  if (typeof failed?.digest === "string") {
    const status = asRecord(failed.status);
    const error = asRecord(status?.error);
    const message = typeof error?.message === "string"
      ? error.message
      : `Transaction failed with digest ${failed.digest}`;
    throw new Error(message);
  }

  throw new Error("Transaction completed without a digest in the wallet result.");
}

async function resolveStorageUnitOwnerCapRef(
  client: SuiJsonRpcClient,
  runtime: LockerRuntimeContext,
  senderAddress: string,
) {
  const bytes = await devInspectBytes(
    client,
    senderAddress,
    `${runtime.worldPackageId}::storage_unit::owner_cap_id`,
    (tx) => [tx.object(runtime.lockerId)],
  );
  if (!bytes) {
    throw new Error("Could not resolve Storage Unit owner cap.");
  }
  return loadObjectRef(client, bcs.Address.parse(bytes));
}

async function resolveVisitorOwnerCapRef(
  client: SuiJsonRpcClient,
  runtime: LockerRuntimeContext,
  senderAddress: string,
) {
  const bytes = await devInspectBytes(
    client,
    senderAddress,
    `${runtime.worldPackageId}::character::owner_cap_id`,
    (tx) => [tx.object(runtime.visitorCharacterId)],
  );
  if (!bytes) {
    throw new Error("Could not resolve visitor Character owner cap.");
  }
  return loadObjectRef(client, bcs.Address.parse(bytes));
}

function buildPolicyVectors(draft: LockerPolicyDraft) {
  const acceptedItems = draft.acceptedItems
    .filter((item) => item.points > 0)
    .map((item) => ({ typeId: item.typeId, points: item.points }));

  if (acceptedItems.length === 0) {
    throw new Error("Policy must keep at least one accepted item.");
  }

  return {
    acceptedTypeIds: acceptedItems.map((item) => BigInt(item.typeId)),
    acceptedPoints: acceptedItems.map((item) => BigInt(item.points)),
    friendlyTribes: draft.friendlyTribes.map((value) => Number(value)),
    rivalTribes: draft.rivalTribes.map((value) => Number(value)),
  };
}

export async function updateLockerPolicy(args: {
  runtime: LockerRuntimeContext;
  senderAddress: string;
  draft: LockerPolicyDraft;
  signAndExecuteTransaction: WalletTxExecutor;
}): Promise<string> {
  const client = createLocalnetClient(deployment);
  const ownerCapRef = await resolveStorageUnitOwnerCapRef(client, args.runtime, args.senderAddress);
  const vectors = buildPolicyVectors(args.draft);

  const tx = new Transaction();
  const [storageOwnerCap, receipt] = tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::borrow_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), tx.receivingRef(ownerCapRef)],
  });

  tx.moveCall({
    target: `${args.runtime.trustLockerPackageId}::trust_locker::set_policy`,
    arguments: [
      tx.object(args.runtime.lockerId),
      storageOwnerCap,
      tx.object(args.runtime.extensionConfigId),
      tx.pure(bcs.vector(bcs.u64()).serialize(vectors.acceptedTypeIds).toBytes()),
      tx.pure(bcs.vector(bcs.u64()).serialize(vectors.acceptedPoints).toBytes()),
      tx.pure(bcs.vector(bcs.u32()).serialize(vectors.friendlyTribes).toBytes()),
      tx.pure(bcs.vector(bcs.u32()).serialize(vectors.rivalTribes).toBytes()),
      tx.pure.u64(BigInt(args.draft.friendlyMultiplierBps)),
      tx.pure.u64(BigInt(args.draft.rivalMultiplierBps)),
      tx.pure.u8(encodeMarketMode(args.draft.marketMode)),
      tx.pure.u64(BigInt(args.draft.fuelFeeUnits)),
      tx.pure.u64(BigInt(args.draft.strikeScopeId)),
      tx.pure(bcs.bool().serialize(args.draft.useSharedPenalties).toBytes()),
      tx.pure.u64(BigInt(args.draft.cooldownMs)),
      tx.pure(bcs.bool().serialize(args.draft.isActive).toBytes()),
    ],
  });

  tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::return_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), storageOwnerCap, receipt],
  });

  const result = await args.signAndExecuteTransaction({
    transaction: tx,
    options: buildExecutionOptions(),
  });
  return extractTransactionDigest(result);
}

export async function updateStrikeNetworkPolicy(args: {
  runtime: LockerRuntimeContext;
  senderAddress: string;
  strikeScopeId: number;
  pricingPenaltyPerStrikeBps: number;
  maxPricingPenaltyBps: number;
  lockoutStrikeThreshold: number;
  networkLockoutDurationMs: number;
  isActive: boolean;
  signAndExecuteTransaction: WalletTxExecutor;
}): Promise<string> {
  const client = createLocalnetClient(deployment);
  const ownerCapRef = await resolveStorageUnitOwnerCapRef(client, args.runtime, args.senderAddress);

  const tx = new Transaction();
  const [storageOwnerCap, receipt] = tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::borrow_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), tx.receivingRef(ownerCapRef)],
  });

  tx.moveCall({
    target: `${args.runtime.trustLockerPackageId}::trust_locker::set_strike_network_policy`,
    arguments: [
      tx.object(args.runtime.lockerId),
      storageOwnerCap,
      tx.object(args.runtime.extensionConfigId),
      tx.pure.u64(BigInt(args.strikeScopeId)),
      tx.pure.u64(BigInt(args.pricingPenaltyPerStrikeBps)),
      tx.pure.u64(BigInt(args.maxPricingPenaltyBps)),
      tx.pure.u64(BigInt(args.lockoutStrikeThreshold)),
      tx.pure.u64(BigInt(args.networkLockoutDurationMs)),
      tx.pure(bcs.bool().serialize(args.isActive).toBytes()),
    ],
  });

  tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::return_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), storageOwnerCap, receipt],
  });

  const result = await args.signAndExecuteTransaction({
    transaction: tx,
    options: buildExecutionOptions(),
  });
  return extractTransactionDigest(result);
}

export async function freezeLockerPolicy(args: {
  runtime: LockerRuntimeContext;
  senderAddress: string;
  signAndExecuteTransaction: WalletTxExecutor;
}): Promise<string> {
  const client = createLocalnetClient(deployment);
  const ownerCapRef = await resolveStorageUnitOwnerCapRef(client, args.runtime, args.senderAddress);

  const tx = new Transaction();
  const [storageOwnerCap, receipt] = tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::borrow_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), tx.receivingRef(ownerCapRef)],
  });

  tx.moveCall({
    target: `${args.runtime.trustLockerPackageId}::trust_locker::freeze_locker`,
    arguments: [tx.object(args.runtime.lockerId), storageOwnerCap],
  });

  tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::return_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::storage_unit::StorageUnit`],
    arguments: [tx.object(args.runtime.ownerCharacterId), storageOwnerCap, receipt],
  });

  const result = await args.signAndExecuteTransaction({
    transaction: tx,
    options: buildExecutionOptions(),
  });
  return extractTransactionDigest(result);
}

export async function executeTrade(args: {
  runtime: LockerRuntimeContext;
  senderAddress: string;
  requestedTypeId: number;
  requestedQuantity: number;
  offeredTypeId: number;
  offeredQuantity: number;
  signAndExecuteTransaction: WalletTxExecutor;
}): Promise<string> {
  const client = createLocalnetClient(deployment);
  const visitorOwnerCapRef = await resolveVisitorOwnerCapRef(client, args.runtime, args.senderAddress);

  const tx = new Transaction();
  const [visitorOwnerCap, receipt] = tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::borrow_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::character::Character`],
    arguments: [tx.object(args.runtime.visitorCharacterId), tx.receivingRef(visitorOwnerCapRef)],
  });

  tx.moveCall({
    target: `${args.runtime.trustLockerPackageId}::trust_locker::trade`,
    arguments: [
      tx.object(args.runtime.lockerId),
      tx.object(args.runtime.visitorCharacterId),
      visitorOwnerCap,
      tx.object(args.runtime.extensionConfigId),
      tx.object("0x6"),
      tx.pure.u64(BigInt(args.requestedTypeId)),
      tx.pure.u32(args.requestedQuantity),
      tx.pure.u64(BigInt(args.offeredTypeId)),
      tx.pure.u32(args.offeredQuantity),
    ],
  });

  tx.moveCall({
    target: `${args.runtime.worldPackageId}::character::return_owner_cap`,
    typeArguments: [`${args.runtime.worldPackageId}::character::Character`],
    arguments: [tx.object(args.runtime.visitorCharacterId), visitorOwnerCap, receipt],
  });

  const result = await args.signAndExecuteTransaction({
    transaction: tx,
    options: buildExecutionOptions(),
  });
  return extractTransactionDigest(result);
}
