import { bcs } from "@mysten/sui/bcs";
import {
    createClient,
    DEFAULT_CLOCK_OBJECT_ID,
    devInspectMoveCallFirstReturnValueBytes,
    getNetwork,
    isDryRun,
    logHeading,
    queryRecentTrustLockerEvents,
    readTrustLockerDeployment,
    resolveRuntimeObjectIds,
} from "./shared";
import { TRUST_LOCKER_CATALOG } from "../../trust-locker.config";

type PolicyField = {
    accepted_items?: Array<{
        fields?: {
            type_id?: string | number;
            base_points_per_unit?: string | number;
        };
    }>;
    friendly_tribes?: number[];
    rival_tribes?: number[];
    friendly_multiplier_bps?: string | number;
    rival_multiplier_bps?: string | number;
    strike_scope_id?: string | number;
    use_shared_penalties?: boolean;
    cooldown_ms?: string | number;
    is_active?: boolean;
    penalties?: Array<{
        fields?: {
            character_id?: string;
            strike_count?: string | number;
            last_deficit_points?: string | number;
            cooldown_end_timestamp_ms?: string | number;
        };
    }>;
};

function toNumber(value: string | number | undefined, fallback = 0): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatBucket(bucket: number): string {
    if (bucket === 0) return "friendly";
    if (bucket === 2) return "rival";
    return "neutral";
}

function formatTimestamp(ms: string | number | undefined): string {
    const value = toNumber(ms, 0);
    if (!value) return "n/a";
    return new Date(value).toISOString();
}

function mapCatalog(typeId: number) {
    return TRUST_LOCKER_CATALOG.find((item) => item.typeId === typeId);
}

function readMoveObjectFields<T extends Record<string, unknown>>(value: unknown): T | null {
    if (typeof value !== "object" || value === null) return null;
    if (!("fields" in value)) return null;
    const fields = (value as { fields?: unknown }).fields;
    if (typeof fields !== "object" || fields === null) return null;
    return fields as T;
}

function summarizeEventType(type?: string): string {
    if (!type) return "unknown";
    return type.split("::").pop() ?? type;
}

function summarizeParsedJson(parsedJson: Record<string, unknown> | undefined): string {
    if (!parsedJson) return "";
    const trade = parsedJson as Record<string, unknown>;
    const locker = trade.locker_id ? String(trade.locker_id) : undefined;
    const visitor = trade.visitor_character_id ? String(trade.visitor_character_id) : undefined;
    const typeId = trade.requested_type_id ?? trade.type_id;
    const qty = trade.requested_quantity ?? trade.quantity;
    const deficit = trade.deficit_points;
    const strike = trade.strike_count;
    const cooldown = trade.cooldown_end_timestamp_ms;

    const parts: string[] = [];
    if (locker) parts.push(`locker=${locker}`);
    if (visitor) parts.push(`visitor=${visitor}`);
    if (typeId !== undefined) parts.push(`type_id=${String(typeId)}`);
    if (qty !== undefined) parts.push(`qty=${String(qty)}`);
    if (deficit !== undefined) parts.push(`deficit=${String(deficit)}`);
    if (strike !== undefined) parts.push(`strikes=${String(strike)}`);
    if (cooldown !== undefined) parts.push(`cooldown=${String(cooldown)}`);
    return parts.join(" ");
}

async function readPolicyField(client: ReturnType<typeof createClient>, extensionConfigId: string) {
    const fields = await client.getDynamicFields({
        parentId: extensionConfigId,
        limit: 20,
    });
    const field = fields.data.find((entry) =>
        String(entry.objectType).endsWith("::trust_locker::LockerPolicy")
    );
    if (!field) {
        throw new Error(`No LockerPolicy dynamic field found under ${extensionConfigId}`);
    }

    const object = await client.getDynamicFieldObject({
        parentId: extensionConfigId,
        name: field.name,
    });
    const content = object.data?.content;
    const policyFields = readMoveObjectFields<{ value?: unknown }>(content)?.value;
    const policy = readMoveObjectFields<PolicyField>(policyFields);
    if (!policy) {
        throw new Error(`Unable to decode LockerPolicy object ${field.objectId}`);
    }

    return { field, policy };
}

async function inspect() {
    const network = getNetwork();
    logHeading(`Trust Locker Live Inspect (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const client = createClient(network);
    const senderAddress = process.env.ADMIN_ADDRESS || process.env.SUI_ADDRESS || objectIds.ownerCharacterId;

    if (isDryRun()) {
        console.log("DRY_RUN enabled. This script reads live state only.");
        return;
    }

    const { field, policy } = await readPolicyField(client, deployment.trustLocker.extensionConfigId);

    const hasPolicyBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::has_policy`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId)],
    });
    const acceptedCountBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::accepted_item_count`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId)],
    });
    const frozenBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.world.packageId}::storage_unit::is_extension_frozen`,
        senderAddress,
        arguments: (tx) => [tx.object(objectIds.storageUnitId)],
    });
    const relationBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::relation_bucket_for_character`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId), tx.object(objectIds.visitorCharacterId)],
    });
    const strikeBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::strike_count`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId), tx.object(objectIds.visitorCharacterId)],
    });
    const cooldownBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::cooldown_end_timestamp_ms`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId), tx.object(objectIds.visitorCharacterId)],
    });
    const inCooldownBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::is_in_cooldown`,
        senderAddress,
        arguments: (tx) => [tx.object(deployment.trustLocker.extensionConfigId), tx.object(objectIds.storageUnitId), tx.object(objectIds.visitorCharacterId), tx.object(DEFAULT_CLOCK_OBJECT_ID)],
    });
    const quoteBytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${deployment.trustLocker.packageId}::trust_locker::quote_requested_points`,
        senderAddress,
        arguments: (tx) => [
            tx.object(deployment.trustLocker.extensionConfigId),
            tx.object(objectIds.storageUnitId),
            tx.object(objectIds.visitorCharacterId),
            tx.pure.u64(deployment.defaults.requestedTypeId),
            tx.pure.u32(deployment.defaults.requestedQuantity),
        ],
    });
    const strikeScopeId = toNumber(policy.strike_scope_id);
    const sharedStrikeBytes =
        strikeScopeId > 0
            ? await devInspectMoveCallFirstReturnValueBytes(client, {
                  target: `${deployment.trustLocker.packageId}::trust_locker::shared_strike_count`,
                  senderAddress,
                  arguments: (tx) => [
                      tx.object(deployment.trustLocker.extensionConfigId),
                      tx.pure.u64(BigInt(strikeScopeId)),
                      tx.object(objectIds.visitorCharacterId),
                  ],
              })
            : null;
    const sharedCooldownBytes =
        strikeScopeId > 0
            ? await devInspectMoveCallFirstReturnValueBytes(client, {
                  target: `${deployment.trustLocker.packageId}::trust_locker::shared_cooldown_end_timestamp_ms`,
                  senderAddress,
                  arguments: (tx) => [
                      tx.object(deployment.trustLocker.extensionConfigId),
                      tx.pure.u64(BigInt(strikeScopeId)),
                      tx.object(objectIds.visitorCharacterId),
                  ],
              })
            : null;
    const sharedPenaltyBytes =
        strikeScopeId > 0
            ? await devInspectMoveCallFirstReturnValueBytes(client, {
                  target: `${deployment.trustLocker.packageId}::trust_locker::shared_pricing_penalty_bps`,
                  senderAddress,
                  arguments: (tx) => [
                      tx.object(deployment.trustLocker.extensionConfigId),
                      tx.pure.u64(BigInt(strikeScopeId)),
                      tx.object(objectIds.visitorCharacterId),
                  ],
              })
            : null;

    const acceptedItems = (policy.accepted_items ?? []).map((item) => {
        const typeId = toNumber(item.fields?.type_id);
        const points = toNumber(item.fields?.base_points_per_unit);
        const catalogItem = mapCatalog(typeId);
        return {
            typeId,
            points,
            label: catalogItem?.label ?? "unknown",
            tier: catalogItem?.tier ?? "unknown",
            note: catalogItem?.note ?? "",
        };
    });

    console.log("Metadata file:", deployment.paths.deploymentFile);
    console.log("Locker id:", objectIds.storageUnitId);
    console.log("Policy object:", field.objectId);
    console.log("Policy active:", policy.is_active ? "yes" : "no");
    console.log("Frozen:", frozenBytes ? (bcs.bool().parse(frozenBytes) ? "yes" : "no") : "unknown");
    console.log("Accepted item count:", acceptedCountBytes ? Number(bcs.u64().parse(acceptedCountBytes)) : acceptedItems.length);
    console.log("Friendly tribes:", JSON.stringify(policy.friendly_tribes ?? []));
    console.log("Rival tribes:", JSON.stringify(policy.rival_tribes ?? []));
    console.log("Friendly multiplier bps:", toNumber(policy.friendly_multiplier_bps));
    console.log("Rival multiplier bps:", toNumber(policy.rival_multiplier_bps));
    console.log("Strike scope ID:", strikeScopeId);
    console.log("Use shared penalties:", policy.use_shared_penalties ? "yes" : "no");
    console.log("Cooldown ms:", toNumber(policy.cooldown_ms));
    console.log("Visitor bucket:", formatBucket(relationBytes ? Number(bcs.u8().parse(relationBytes)) : 1));
    console.log("Visitor strike count:", strikeBytes ? Number(bcs.u64().parse(strikeBytes)) : 0);
    console.log("Visitor cooldown ends:", formatTimestamp(cooldownBytes ? bcs.u64().parse(cooldownBytes).toString() : undefined));
    console.log("Visitor in cooldown:", inCooldownBytes ? (bcs.bool().parse(inCooldownBytes) ? "yes" : "no") : "unknown");
    if (strikeScopeId > 0) {
        console.log(
            "Visitor shared strike count:",
            sharedStrikeBytes ? Number(bcs.u64().parse(sharedStrikeBytes)) : 0
        );
        console.log(
            "Visitor shared cooldown ends:",
            formatTimestamp(sharedCooldownBytes ? bcs.u64().parse(sharedCooldownBytes).toString() : undefined)
        );
        console.log(
            "Visitor shared pricing penalty (bps):",
            sharedPenaltyBytes ? bcs.u64().parse(sharedPenaltyBytes).toString() : "0"
        );
    }
    console.log(
        "Quoted requested points:",
        quoteBytes ? bcs.u64().parse(quoteBytes).toString() : "unknown"
    );

    console.log("Accepted items:");
    for (const item of acceptedItems) {
        console.log(
            `- type_id ${item.typeId} | points ${item.points} | ${item.label} | ${item.tier}${item.note ? ` | ${item.note}` : ""}`
        );
    }

    console.log("Penalties:");
    for (const penalty of policy.penalties ?? []) {
        const fields = penalty.fields ?? {};
        console.log(
            `- character ${fields.character_id ?? "unknown"} | strikes ${fields.strike_count ?? "0"} | deficit ${fields.last_deficit_points ?? "0"} | cooldown ends ${formatTimestamp(fields.cooldown_end_timestamp_ms)}`
        );
    }

    const recentEvents = await queryRecentTrustLockerEvents({
        client,
        packageId: deployment.trustLocker.packageId,
        limit: 10,
    });
    const recentRelevant = recentEvents.filter((event) => {
        const shortType = summarizeEventType(event.type);
        return [
            "TradeExecuted",
            "StrikeIssued",
            "CooldownUpdated",
            "PolicyUpdated",
            "LockerFrozen",
            "ItemWithdrawnEvent",
            "ItemDepositedEvent",
        ].includes(shortType);
    });

    console.log("Recent signals:");
    console.log(`- matched ${recentRelevant.length} of ${recentEvents.length} recent module events`);
    for (const event of recentRelevant) {
        console.log(
            `- ${summarizeEventType(event.type)} | tx=${event.id?.txDigest ?? "unknown"} | seq=${event.id?.eventSeq ?? "?"} | ${summarizeParsedJson(event.parsedJson)}`
        );
    }
}

inspect().catch((error) => {
    console.error("Failed to inspect Trust Locker state:", error);
    process.exit(1);
});
