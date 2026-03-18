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
    logHeading(`Authorize Trust Locker Extension (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned authorization:");
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Owner character:", objectIds.ownerCharacterId);
        console.log(
            "Auth type:",
            `${deployment.trustLocker.packageId}::config::TrustLockerAuth`
        );
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
    const authType = `${deployment.trustLocker.packageId}::config::TrustLockerAuth`;

    const tx = new Transaction();

    const [storageOwnerCap, receipt] = tx.moveCall({
        target: `${deployment.world.packageId}::character::borrow_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), tx.receivingRef(storageOwnerCapRef)],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::storage_unit::authorize_extension`,
        typeArguments: [authType],
        arguments: [tx.object(objectIds.storageUnitId), storageOwnerCap],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::storage_unit::StorageUnit`],
        arguments: [tx.object(objectIds.ownerCharacterId), storageOwnerCap, receipt],
    });

    const result = await executeTransaction(client, key.keypair, tx);
    console.log("Authorization transaction digest:", result.digest);
}

main().catch((error) => {
    console.error("Failed to authorize Trust Locker extension:", error);
    process.exit(1);
});
