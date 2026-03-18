import { Transaction } from "@mysten/sui/transactions";
import {
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
    logHeading(`Seed Trust Locker Open Inventory (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const seedTypeId = BigInt(process.env.LOCKER_SEED_TYPE_ID ?? deployment.defaults.requestedTypeId);
    const seedQuantity = Number(process.env.LOCKER_SEED_QUANTITY ?? deployment.defaults.requestedQuantity);

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned open inventory seed:");
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Owner character:", objectIds.ownerCharacterId);
        console.log("Seed type_id:", seedTypeId.toString());
        console.log("Seed quantity:", seedQuantity);
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
        target: `${deployment.trustLocker.packageId}::trust_locker::seed_open_inventory`,
        arguments: [
            tx.object(objectIds.storageUnitId),
            tx.object(objectIds.ownerCharacterId),
            storageOwnerCap,
            tx.pure.u64(seedTypeId),
            tx.pure.u32(seedQuantity),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), storageOwnerCap, receipt],
    });

    const result = await executeTransaction(client, key.keypair, tx);
    console.log("Seed transaction digest:", result.digest);
}

main().catch((error) => {
    console.error("Failed to seed open inventory:", error);
    process.exit(1);
});
