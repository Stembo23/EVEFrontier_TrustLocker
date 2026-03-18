import fs from "node:fs";
import { DEFAULT_LOCKER_POLICY } from "../trust-locker.config";
import { getNetwork, getTrustLockerDeploymentPath } from "./trust-locker/shared";

type DeploymentSummary = {
  network?: string;
  trustLocker?: {
    packageId?: string;
    extensionConfigId?: string;
  };
};

function readJsonIfPresent(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const network = getNetwork();
  const root = process.cwd();
  const deploymentPath = getTrustLockerDeploymentPath(network);
  const deployment = readJsonIfPresent(deploymentPath) as DeploymentSummary | null;

  console.log("Trust Locker context");
  console.log("====================");
  console.log(`Workspace: ${root}`);
  console.log(`Network: ${network}`);
  console.log(`Local deployment file: ${fs.existsSync(deploymentPath) ? deploymentPath : "not found"}`);
  console.log(`Default accepted items: ${DEFAULT_LOCKER_POLICY.acceptedItems.length}`);
  console.log(`Friendly tribes: ${DEFAULT_LOCKER_POLICY.friendlyTribes.join(", ") || "none"}`);
  console.log(`Rival tribes: ${DEFAULT_LOCKER_POLICY.rivalTribes.join(", ") || "none"}`);

  if (deployment) {
    console.log("");
    console.log("Discovered deployment");
    console.log("---------------------");
    console.log(`Network: ${deployment.network ?? "unknown"}`);
    console.log(`Trust Locker Package ID: ${deployment.trustLocker?.packageId ?? "missing"}`);
    console.log(`Extension Config ID: ${deployment.trustLocker?.extensionConfigId ?? "missing"}`);
  } else {
    console.log("");
    console.log("Next step");
    console.log("---------");
    console.log("Publish the Trust Locker package locally, then write deployments/localnet/trust-locker.json.");
  }
}

main();
