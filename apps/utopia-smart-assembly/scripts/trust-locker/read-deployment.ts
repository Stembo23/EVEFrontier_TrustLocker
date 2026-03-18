import {
    getNetwork,
    logHeading,
    readTrustLockerDeployment,
    resolveRuntimeObjectIds,
} from "./shared";

function main() {
    const network = getNetwork();
    logHeading(`Read Trust Locker Deployment (${network})`);
    const deployment = readTrustLockerDeployment(network);
    const objectIds = resolveRuntimeObjectIds(deployment);

    console.log("Metadata file:", deployment.paths.deploymentFile);
    console.log("Network:", deployment.network);
    console.log("Tenant:", deployment.tenant);
    console.log("RPC URL:", deployment.rpcUrl);
    console.log("World package:", deployment.world.packageId);
    console.log("Object registry:", deployment.world.objectRegistry);
    console.log("Trust Locker package:", deployment.trustLocker.packageId);
    console.log("ExtensionConfig:", deployment.trustLocker.extensionConfigId);
    console.log("AdminCap:", deployment.trustLocker.adminCapId ?? "not set");
    console.log("Derived storage unit:", objectIds.storageUnitId);
    console.log("Derived owner character:", objectIds.ownerCharacterId);
    console.log("Derived visitor character:", objectIds.visitorCharacterId);
    console.log("Defaults:", JSON.stringify(deployment.defaults, null, 2));
}

main();
