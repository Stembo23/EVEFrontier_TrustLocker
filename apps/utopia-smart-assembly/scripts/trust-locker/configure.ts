import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import {
    boolFromEnv,
    createClient,
    decodeKeypairFromEnv,
    executeTransaction,
    getNetwork,
    getReceivingObjectRef,
    getStorageUnitOwnerCapId,
    isDryRun,
    logHeading,
    parseCsvBigints,
    parseCsvNumbers,
    readTrustLockerDeployment,
    resolveRuntimeObjectIds,
} from "./shared";

function getAcceptedTypeIds(defaultRequestedTypeId: number, defaultOfferedTypeId: number): bigint[] {
    const parsed = parseCsvBigints(process.env.LOCKER_ACCEPTED_TYPE_IDS);
    if (parsed.length > 0) return parsed;
    const defaults = [BigInt(defaultRequestedTypeId), BigInt(defaultOfferedTypeId)];
    return Array.from(new Set(defaults.map((value) => value.toString())), (value) => BigInt(value));
}

function getAcceptedPoints(expectedCount: number): bigint[] {
    const parsed = parseCsvBigints(process.env.LOCKER_ACCEPTED_POINTS);
    if (parsed.length > 0) {
        if (parsed.length !== expectedCount) {
            throw new Error(
                `LOCKER_ACCEPTED_POINTS length (${parsed.length}) must match accepted type_ids length (${expectedCount})`
            );
        }
        return parsed;
    }
    return Array.from({ length: expectedCount }, () => 10n);
}

async function main() {
    const network = getNetwork();
    logHeading(`Configure Barter Box Policy (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const acceptedTypeIds = getAcceptedTypeIds(
        deployment.defaults.requestedTypeId,
        deployment.defaults.offeredTypeId
    );
    const acceptedPoints = getAcceptedPoints(acceptedTypeIds.length);
    const friendlyTribes = parseCsvNumbers(process.env.LOCKER_FRIENDLY_TRIBES);
    const rivalTribes = parseCsvNumbers(process.env.LOCKER_RIVAL_TRIBES);
    const resolvedFriendlyTribes =
        friendlyTribes.length > 0 ? friendlyTribes : deployment.defaults.friendlyTribes;
    const resolvedRivalTribes =
        rivalTribes.length > 0 ? rivalTribes : deployment.defaults.rivalTribes;
    const friendlyMultiplierBps = Number(
        process.env.LOCKER_FRIENDLY_MULTIPLIER_BPS ?? deployment.defaults.friendlyMultiplierBps
    );
    const rivalMultiplierBps = Number(
        process.env.LOCKER_RIVAL_MULTIPLIER_BPS ?? deployment.defaults.rivalMultiplierBps
    );
    const cooldownMs = Number(process.env.LOCKER_COOLDOWN_MS ?? deployment.defaults.cooldownMs);
    const strikeScopeId = Number(process.env.LOCKER_STRIKE_SCOPE_ID ?? 0);
    const useSharedPenalties = boolFromEnv("LOCKER_USE_SHARED_PENALTIES", false);
    const isActive = boolFromEnv("LOCKER_IS_ACTIVE", deployment.defaults.isActive);

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned configuration:");
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Owner character:", objectIds.ownerCharacterId);
        console.log("Accepted type_ids:", acceptedTypeIds.map((x) => x.toString()).join(", "));
        console.log("Accepted points:", acceptedPoints.map((x) => x.toString()).join(", "));
        console.log("Friendly tribes:", resolvedFriendlyTribes.join(", "));
        console.log("Rival tribes:", resolvedRivalTribes.join(", "));
        console.log("Friendly multiplier (bps):", friendlyMultiplierBps);
        console.log("Rival multiplier (bps):", rivalMultiplierBps);
        console.log("Strike scope ID:", strikeScopeId);
        console.log("Use shared penalties:", useSharedPenalties);
        console.log("Cooldown ms:", cooldownMs);
        console.log("Active:", isActive);
        console.log(
            "Required signer env (one of): LOCKER_OWNER_PRIVATE_KEY, PLAYER_A_PRIVATE_KEY, ADMIN_PRIVATE_KEY"
        );
        return;
    }

    const key = decodeKeypairFromEnv(
        "LOCKER_OWNER_PRIVATE_KEY",
        "PLAYER_A_PRIVATE_KEY",
        "ADMIN_PRIVATE_KEY"
    );
    const ownerAddress = key.keypair.getPublicKey().toSuiAddress();
    const client = createClient(network);
    const storageOwnerCapId = await getStorageUnitOwnerCapId(
        client,
        deployment.world.packageId,
        objectIds.storageUnitId,
        ownerAddress
    );
    const storageOwnerCapRef = await getReceivingObjectRef(client, storageOwnerCapId);

    const tx = new Transaction();

    const [storageOwnerCap, receipt] = tx.moveCall({
        target: `${deployment.world.packageId}::character::borrow_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), tx.receivingRef(storageOwnerCapRef)],
    });

    tx.moveCall({
        target: `${deployment.trustLocker.packageId}::trust_locker::set_policy`,
        arguments: [
            tx.object(objectIds.storageUnitId),
            storageOwnerCap,
            tx.object(deployment.trustLocker.extensionConfigId),
            tx.pure(bcs.vector(bcs.u64()).serialize(acceptedTypeIds).toBytes()),
            tx.pure(bcs.vector(bcs.u64()).serialize(acceptedPoints).toBytes()),
            tx.pure(
                bcs
                    .vector(bcs.u32())
                    .serialize(resolvedFriendlyTribes.map((x) => Number(x)))
                    .toBytes()
            ),
            tx.pure(
                bcs
                    .vector(bcs.u32())
                    .serialize(resolvedRivalTribes.map((x) => Number(x)))
                    .toBytes()
            ),
            tx.pure.u64(BigInt(friendlyMultiplierBps)),
            tx.pure.u64(BigInt(rivalMultiplierBps)),
            tx.pure.u64(BigInt(strikeScopeId)),
            tx.pure(bcs.bool().serialize(useSharedPenalties).toBytes()),
            tx.pure.u64(BigInt(cooldownMs)),
            tx.pure(bcs.bool().serialize(isActive).toBytes()),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), storageOwnerCap, receipt],
    });

    const result = await executeTransaction(client, key.keypair, tx);
    console.log("Configuration transaction digest:", result.digest);
}

main().catch((error) => {
    console.error("Failed to configure Barter Box policy:", error);
    process.exit(1);
});
