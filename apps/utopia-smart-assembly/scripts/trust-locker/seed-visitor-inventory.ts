import { Transaction } from "@mysten/sui/transactions";
import {
    createClient,
    decodeKeypairFromEnv,
    executeSponsoredTransaction,
    getCharacterOwnerCapId,
    getNetwork,
    getReceivingObjectRef,
    isDryRun,
    logHeading,
    readTrustLockerDeployment,
    resolveAdminAclId,
    resolveRuntimeObjectIds,
} from "./shared";

async function main() {
    const network = getNetwork();
    logHeading(`Seed Barter Box Visitor Inventory (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const visitorItemId = BigInt(process.env.LOCKER_VISITOR_ITEM_ID ?? 444000101);
    const visitorTypeId = BigInt(
        process.env.LOCKER_VISITOR_TYPE_ID ?? deployment.defaults.offeredTypeId
    );
    const visitorVolume = BigInt(process.env.LOCKER_VISITOR_VOLUME ?? 10);
    const visitorQuantity = Number(process.env.LOCKER_VISITOR_QUANTITY ?? 5);

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned visitor inventory seed:");
        console.log("Storage unit:", objectIds.storageUnitId);
        console.log("Visitor character:", objectIds.visitorCharacterId);
        console.log("Item id:", visitorItemId.toString());
        console.log("Type id:", visitorTypeId.toString());
        console.log("Volume:", visitorVolume.toString());
        console.log("Quantity:", visitorQuantity);
        console.log(
            "Required signer envs: LOCKER_VISITOR_PRIVATE_KEY or PLAYER_B_PRIVATE_KEY, plus ADMIN_PRIVATE_KEY"
        );
        return;
    }

    const visitorKey = decodeKeypairFromEnv(
        "LOCKER_VISITOR_PRIVATE_KEY",
        "PLAYER_B_PRIVATE_KEY",
        "ADMIN_PRIVATE_KEY"
    );
    const adminKey = decodeKeypairFromEnv("ADMIN_PRIVATE_KEY");
    const visitorAddress = visitorKey.keypair.getPublicKey().toSuiAddress();
    const adminAddress = adminKey.keypair.getPublicKey().toSuiAddress();
    const client = createClient(network);
    const { adminAclId } = resolveAdminAclId(network);
    const visitorOwnerCapId = await getCharacterOwnerCapId(
        client,
        deployment.world.packageId,
        objectIds.visitorCharacterId,
        visitorAddress
    );
    const visitorOwnerCapRef = await getReceivingObjectRef(client, visitorOwnerCapId);

    const tx = new Transaction();
    tx.setSender(visitorAddress);
    tx.setGasOwner(adminAddress);

    const [visitorOwnerCap, receipt] = tx.moveCall({
        target: `${deployment.world.packageId}::character::borrow_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::character::Character`],
        arguments: [
            tx.object(objectIds.visitorCharacterId),
            tx.receivingRef(visitorOwnerCapRef),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::storage_unit::game_item_to_chain_inventory`,
        typeArguments: [`${deployment.world.packageId}::character::Character`],
        arguments: [
            tx.object(objectIds.storageUnitId),
            tx.object(adminAclId),
            tx.object(objectIds.visitorCharacterId),
            visitorOwnerCap,
            tx.pure.u64(visitorItemId),
            tx.pure.u64(visitorTypeId),
            tx.pure.u64(visitorVolume),
            tx.pure.u32(visitorQuantity),
        ],
    });

    tx.moveCall({
        target: `${deployment.world.packageId}::character::return_owner_cap`,
        typeArguments: [`${deployment.world.packageId}::character::Character`],
        arguments: [tx.object(objectIds.visitorCharacterId), visitorOwnerCap, receipt],
    });

    const result = await executeSponsoredTransaction(
        tx,
        client,
        visitorKey.keypair,
        adminKey.keypair,
        visitorAddress,
        adminAddress
    );
    console.log("Visitor inventory seed transaction digest:", result.digest);
}

main().catch((error) => {
    console.error("Failed to seed visitor inventory:", error);
    process.exit(1);
});
