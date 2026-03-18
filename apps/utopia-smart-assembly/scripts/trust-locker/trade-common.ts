import { Transaction } from "@mysten/sui/transactions";
import {
    createClient,
    decodeKeypairFromEnv,
    DEFAULT_CLOCK_OBJECT_ID,
    executeTransaction,
    getCharacterOwnerCapId,
    getNetwork,
    getReceivingObjectRef,
    isDryRun,
    logHeading,
    readTrustLockerDeployment,
    resolveRuntimeObjectIds,
} from "./shared";

export async function runTrade(mode: "fair" | "dishonest") {
    const network = getNetwork();
    logHeading(`Trust Locker Trade (${mode.toUpperCase()}, ${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const requestedTypeId = BigInt(
        process.env.LOCKER_REQUESTED_TYPE_ID ?? deployment.defaults.requestedTypeId
    );
    const requestedQuantity = Number(
        process.env.LOCKER_REQUESTED_QUANTITY ?? deployment.defaults.requestedQuantity
    );
    const offeredTypeId = BigInt(
        process.env.LOCKER_OFFERED_TYPE_ID ?? deployment.defaults.offeredTypeId
    );
    const defaultOfferedQuantity =
        mode === "fair"
            ? deployment.defaults.fairOfferedQuantity
            : deployment.defaults.dishonestOfferedQuantity;
    const offeredQuantity = Number(
        process.env.LOCKER_OFFERED_QUANTITY ?? defaultOfferedQuantity
    );
    const clockObjectId = process.env.CLOCK_OBJECT_ID || DEFAULT_CLOCK_OBJECT_ID;

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned trade:");
        console.log("Mode:", mode);
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Visitor character:", objectIds.visitorCharacterId);
        console.log("Requested type_id:", requestedTypeId.toString());
        console.log("Requested quantity:", requestedQuantity);
        console.log("Offered type_id:", offeredTypeId.toString());
        console.log("Offered quantity:", offeredQuantity);
        console.log("Clock object:", clockObjectId);
        console.log(
            "Required signer env (one of): LOCKER_VISITOR_PRIVATE_KEY, PLAYER_B_PRIVATE_KEY, ADMIN_PRIVATE_KEY"
        );
        return;
    }

    const key = decodeKeypairFromEnv(
        "LOCKER_VISITOR_PRIVATE_KEY",
        "PLAYER_B_PRIVATE_KEY",
        "ADMIN_PRIVATE_KEY"
    );
    const visitorAddress = key.keypair.getPublicKey().toSuiAddress();
    const client = createClient(network);
    const visitorOwnerCapId = await getCharacterOwnerCapId(
        client,
        deployment.world.packageId,
        objectIds.visitorCharacterId,
        visitorAddress
    );
    const visitorOwnerCapRef = await getReceivingObjectRef(client, visitorOwnerCapId);

    const tx = new Transaction();
    const [visitorOwnerCap, receipt] = tx.moveCall({
        target: `${deployment.world.packageId}::character::borrow_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::character::Character`],
        arguments: [tx.object(objectIds.visitorCharacterId), tx.receivingRef(visitorOwnerCapRef)],
    });

    tx.moveCall({
        target: `${deployment.trustLocker.packageId}::trust_locker::trade`,
        arguments: [
            tx.object(objectIds.storageUnitId),
            tx.object(objectIds.visitorCharacterId),
            visitorOwnerCap,
            tx.object(deployment.trustLocker.extensionConfigId),
            tx.object(clockObjectId),
            tx.pure.u64(requestedTypeId),
            tx.pure.u32(requestedQuantity),
            tx.pure.u64(offeredTypeId),
            tx.pure.u32(offeredQuantity),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::character::Character`],
        arguments: [tx.object(objectIds.visitorCharacterId), visitorOwnerCap, receipt],
    });

    const result = await executeTransaction(client, key.keypair, tx);
    console.log(`${mode} trade transaction digest:`, result.digest);
}
