import * as fs from "node:fs";
import {
    boolFromEnv,
    createClient,
    defaultDeploymentFromPublish,
    ensureDeploymentDir,
    extractPublishedTrustLockerIds,
    getNetwork,
    getTrustLockerPublishOutputPath,
    isDryRun,
    logHeading,
    resolveWorldObjectIds,
    runSuiPublish,
    TRUST_LOCKER_MOVE_PATH,
    writeTrustLockerDeployment,
} from "./shared";

async function main() {
    const network = getNetwork();
    logHeading(`Publish Barter Box (${network})`);
    const withUnpublishedDeps = boolFromEnv(
        "LOCKER_PUBLISH_WITH_UNPUBLISHED_DEPS",
        network === "localnet"
    );

    ensureDeploymentDir(network);

    if (isDryRun()) {
        console.log("DRY_RUN enabled. Publish command preview:");
        if (network === "localnet") {
            console.log(
                "sui client test-publish --build-env testnet --pubfile-path <resolved Pub.localnet.toml> --json"
            );
        } else {
            console.log(
                `sui client publish ${TRUST_LOCKER_MOVE_PATH} --json${withUnpublishedDeps ? " --with-unpublished-dependencies" : ""}`
            );
        }
        return;
    }
    const publish = runSuiPublish(TRUST_LOCKER_MOVE_PATH, network, {
        withUnpublishedDependencies: withUnpublishedDeps,
    });
    const publishOutputFile = getTrustLockerPublishOutputPath(network);
    fs.writeFileSync(publishOutputFile, publish.outputRaw, "utf8");

    const client = createClient(network);
    const ids = await extractPublishedTrustLockerIds({
        publishOutput: publish.output,
        client,
    });
    const { world, sourcePath } = resolveWorldObjectIds(network);

    const deployment = defaultDeploymentFromPublish({
        network,
        world,
        worldSourcePath: sourcePath,
        trustLockerPackageId: ids.packageId,
        extensionConfigId: ids.extensionConfigId,
        adminCapId: ids.adminCapId,
        publishDigest: publish.output?.digest,
    });
    writeTrustLockerDeployment(deployment);

    console.log("Publish digest:", publish.output?.digest ?? "unknown");
    console.log("Barter Box package:", ids.packageId);
    console.log("ExtensionConfig:", ids.extensionConfigId);
    console.log("AdminCap:", ids.adminCapId ?? "not found");
    console.log("Deployment metadata:", deployment.paths.deploymentFile);
    console.log("Publish output:", deployment.paths.publishOutputFile);
}

main().catch((error) => {
    console.error("Failed to publish Barter Box:", error);
    process.exit(1);
});
