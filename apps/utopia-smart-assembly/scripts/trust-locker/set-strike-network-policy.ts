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
    readTrustLockerDeployment,
    resolveRuntimeObjectIds,
} from "./shared";

async function main() {
    const network = getNetwork();
    logHeading(`Set Barter Box Strike Network Policy (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const strikeScopeId = Number(process.env.LOCKER_STRIKE_SCOPE_ID ?? 0);
    const pricingPenaltyPerStrikeBps = Number(
        process.env.LOCKER_SHARED_PRICING_PENALTY_PER_STRIKE_BPS ?? 500
    );
    const maxPricingPenaltyBps = Number(process.env.LOCKER_SHARED_MAX_PRICING_PENALTY_BPS ?? 5000);
    const lockoutStrikeThreshold = Number(process.env.LOCKER_SHARED_LOCKOUT_STRIKE_THRESHOLD ?? 3);
    const networkLockoutDurationMs = Number(
        process.env.LOCKER_SHARED_NETWORK_LOCKOUT_DURATION_MS ?? 300000
    );
    const isActive = boolFromEnv("LOCKER_SHARED_POLICY_ACTIVE", true);

    if (lockoutStrikeThreshold <= 0) {
        throw new Error("LOCKER_SHARED_LOCKOUT_STRIKE_THRESHOLD must be greater than zero.");
    }

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned strike network policy:");
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Strike scope ID:", strikeScopeId);
        console.log("Pricing penalty / strike (bps):", pricingPenaltyPerStrikeBps);
        console.log("Max pricing penalty (bps):", maxPricingPenaltyBps);
        console.log("Lockout threshold:", lockoutStrikeThreshold);
        console.log("Network lockout duration (ms):", networkLockoutDurationMs);
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
        target: `${deployment.trustLocker.packageId}::trust_locker::set_strike_network_policy`,
        arguments: [
            tx.object(objectIds.storageUnitId),
            storageOwnerCap,
            tx.object(deployment.trustLocker.extensionConfigId),
            tx.pure.u64(BigInt(strikeScopeId)),
            tx.pure.u64(BigInt(pricingPenaltyPerStrikeBps)),
            tx.pure.u64(BigInt(maxPricingPenaltyBps)),
            tx.pure.u64(BigInt(lockoutStrikeThreshold)),
            tx.pure.u64(BigInt(networkLockoutDurationMs)),
            tx.pure(bcs.bool().serialize(isActive).toBytes()),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), storageOwnerCap, receipt],
    });

    const result = await executeTransaction(client, key.keypair, tx);
    console.log("Strike network configuration transaction digest:", result.digest);
}

main().catch((error) => {
    console.error("Failed to set Barter Box strike network policy:", error);
    process.exit(1);
});
