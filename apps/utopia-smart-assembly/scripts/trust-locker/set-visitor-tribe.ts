import { Transaction } from "@mysten/sui/transactions";
import {
    createClient,
    decodeKeypairFromEnv,
    executeTransaction,
    getNetwork,
    isDryRun,
    logHeading,
    readTrustLockerDeployment,
    resolveAdminAclId,
    resolveRuntimeObjectIds,
} from "./shared";

async function main() {
    const network = getNetwork();
    logHeading(`Set Barter Box Visitor Tribe (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);
    const { adminAclId } = resolveAdminAclId(network);
    const tribeId = Number(
        process.env.LOCKER_TARGET_TRIBE_ID ?? deployment.defaults.rivalTribes[0] ?? 200
    );

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Planned tribe update:");
        console.log("Visitor character:", objectIds.visitorCharacterId);
        console.log("Admin ACL:", adminAclId);
        console.log("Target tribe:", tribeId);
        console.log("Required signer env: ADMIN_PRIVATE_KEY");
        return;
    }

    const adminKey = decodeKeypairFromEnv("ADMIN_PRIVATE_KEY");
    const client = createClient(network);
    const tx = new Transaction();

    tx.moveCall({
        target: `${deployment.world.packageId}::character::update_tribe`,
        arguments: [
            tx.object(objectIds.visitorCharacterId),
            tx.object(adminAclId),
            tx.pure.u32(tribeId),
        ],
    });

    const result = await executeTransaction(client, adminKey.keypair, tx);
    console.log("Visitor tribe update transaction digest:", result.digest);
    console.log("Visitor character:", objectIds.visitorCharacterId);
    console.log("New tribe:", tribeId);
}

main().catch((error) => {
    console.error("Failed to update visitor tribe:", error);
    process.exit(1);
});
