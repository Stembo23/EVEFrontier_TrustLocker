import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { deriveObjectID } from "@mysten/sui/utils";

export type Network = "localnet" | "testnet" | "devnet" | "mainnet";

export type WorldObjectIds = {
    packageId: string;
    objectRegistry: string;
};

export type TrustLockerDeployment = {
    version: 1;
    network: Network;
    tenant: string;
    rpcUrl: string;
    world: WorldObjectIds;
    trustLocker: {
        packageId: string;
        extensionConfigId: string;
        adminCapId?: string;
        publishDigest?: string;
    };
    defaults: {
        storageUnitItemId: number;
        ownerCharacterItemId: number;
        visitorCharacterItemId: number;
        requestedTypeId: number;
        offeredTypeId: number;
        requestedQuantity: number;
        fairOfferedQuantity: number;
        dishonestOfferedQuantity: number;
        friendlyTribes: number[];
        rivalTribes: number[];
        friendlyMultiplierBps: number;
        rivalMultiplierBps: number;
        cooldownMs: number;
        isActive: boolean;
    };
    paths: {
        deploymentFile: string;
        publishOutputFile: string;
        worldSourceFile: string;
    };
    updatedAt: string;
};

type ExtractedObjectIds = {
    network: string;
    world: {
        packageId: string;
        objectRegistry: string;
        adminAcl?: string;
    };
};

type TestResources = {
    character: { gameCharacterId: number; gameCharacterBId: number };
    storageUnit: { itemId: number };
    item: { typeId: number };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, "..", "..");
export const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..", "..");
export const TRUST_LOCKER_MOVE_PATH = path.resolve(
    APP_ROOT,
    "move-contracts",
    "trust_locker_extension"
);
export const DEFAULT_CLOCK_OBJECT_ID = "0x6";
export const DEFAULT_TENANT = process.env.TENANT || "dev";

const DEFAULT_RPC_URLS: Record<Network, string> = {
    localnet: "http://127.0.0.1:9000",
    testnet: "https://fullnode.testnet.sui.io:443",
    devnet: "https://fullnode.devnet.sui.io:443",
    mainnet: "https://fullnode.mainnet.sui.io:443",
};

const TenantItemId = bcs.struct("TenantItemId", {
    id: bcs.u64(),
    tenant: bcs.string(),
});

function parseJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function getWorldIdCandidatePaths(network: Network): string[] {
    return [
        path.resolve(APP_ROOT, "deployments", network, "extracted-object-ids.json"),
        path.resolve(
            WORKSPACE_ROOT,
            "vendor",
            "builder-scaffold",
            "deployments",
            network,
            "extracted-object-ids.json"
        ),
        path.resolve(
            WORKSPACE_ROOT,
            "vendor",
            "world-contracts",
            "deployments",
            network,
            "extracted-object-ids.json"
        ),
    ];
}

function resolveTestResourcesPath(): string {
    const candidates = [
        path.resolve(WORKSPACE_ROOT, "test-resources.json"),
        path.resolve(WORKSPACE_ROOT, "vendor", "world-contracts", "test-resources.json"),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) {
        throw new Error(
            `No test-resources.json found. Checked: ${candidates.join(", ")}`
        );
    }
    return found;
}

export function getNetwork(): Network {
    return (process.env.SUI_NETWORK as Network) || "localnet";
}

export function getRpcUrl(network: Network): string {
    return process.env.SUI_RPC_URL || DEFAULT_RPC_URLS[network];
}

export function createClient(network: Network): SuiJsonRpcClient {
    return new SuiJsonRpcClient({ url: getRpcUrl(network), network });
}

export function getTrustLockerDeploymentPath(network: Network): string {
    return path.resolve(APP_ROOT, "deployments", network, "trust-locker.json");
}

export function getTrustLockerPublishOutputPath(network: Network): string {
    return path.resolve(APP_ROOT, "deployments", network, "trust-locker-publish.json");
}

export function ensureDeploymentDir(network: Network): string {
    const dirPath = path.dirname(getTrustLockerDeploymentPath(network));
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}

export function resolveWorldObjectIds(network: Network): {
    world: WorldObjectIds;
    sourcePath: string;
} {
    const candidates = getWorldIdCandidatePaths(network);
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (!existing) {
        throw new Error(
            `Missing extracted world object IDs for ${network}. Checked: ${candidates.join(", ")}`
        );
    }

    const parsed = parseJsonFile<ExtractedObjectIds>(existing);
    if (!parsed.world?.packageId || !parsed.world?.objectRegistry) {
        throw new Error(`Invalid world IDs file: ${existing}`);
    }

    return {
        world: {
            packageId: parsed.world.packageId,
            objectRegistry: parsed.world.objectRegistry,
        },
        sourcePath: existing,
    };
}

export function resolveAdminAclId(network: Network): { adminAclId: string; sourcePath: string } {
    const candidates = getWorldIdCandidatePaths(network);
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (!existing) {
        throw new Error(
            `Missing extracted world object IDs for ${network}. Checked: ${candidates.join(", ")}`
        );
    }

    const parsed = parseJsonFile<ExtractedObjectIds>(existing);
    if (!parsed.world?.adminAcl) {
        throw new Error(`Invalid world IDs file, missing adminAcl: ${existing}`);
    }

    return {
        adminAclId: parsed.world.adminAcl,
        sourcePath: existing,
    };
}

function getLocalnetPubfileCandidatePaths(): string[] {
    return [
        path.resolve(APP_ROOT, "deployments", "localnet", "Pub.localnet.toml"),
        path.resolve(
            WORKSPACE_ROOT,
            "vendor",
            "world-contracts",
            "contracts",
            "world",
            "Pub.localnet.toml"
        ),
        path.resolve(
            WORKSPACE_ROOT,
            "vendor",
            "builder-scaffold",
            "deployments",
            "localnet",
            "Pub.localnet.toml"
        ),
    ];
}

export function resolveLocalnetPubfilePath(): string {
    const candidates = getLocalnetPubfileCandidatePaths();
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (!existing) {
        throw new Error(
            `Missing localnet Pub.localnet.toml. Checked: ${candidates.join(", ")}`
        );
    }
    return existing;
}

export function loadTestResources(): { data: TestResources; sourcePath: string } {
    const sourcePath = resolveTestResourcesPath();
    const data = parseJsonFile<TestResources>(sourcePath);
    return { data, sourcePath };
}

export function readTrustLockerDeployment(network: Network): TrustLockerDeployment {
    const filePath = getTrustLockerDeploymentPath(network);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Barter Box deployment metadata not found at ${filePath}. Run publish first.`
        );
    }
    return parseJsonFile<TrustLockerDeployment>(filePath);
}

export function writeTrustLockerDeployment(deployment: TrustLockerDeployment) {
    ensureDeploymentDir(deployment.network);
    fs.writeFileSync(
        deployment.paths.deploymentFile,
        JSON.stringify(deployment, null, 2),
        "utf8"
    );
}

export function deriveWorldObjectId(
    objectRegistryId: string,
    itemId: bigint,
    worldPackageId: string,
    tenant: string
): string {
    const keyValue = {
        id: itemId,
        tenant,
    };
    const keyBytes = TenantItemId.serialize(keyValue).toBytes();
    const keyTypeTag = `${worldPackageId}::in_game_id::TenantItemId`;
    return deriveObjectID(objectRegistryId, keyTypeTag, keyBytes);
}

export function decodeKeypairFromEnv(...envNames: string[]): {
    keypair: Ed25519Keypair;
    sourceEnv: string;
} {
    for (const envName of envNames) {
        const value = process.env[envName];
        if (!value) continue;
        const { scheme, secretKey } = decodeSuiPrivateKey(value);
        if (scheme !== "ED25519") {
            throw new Error(`${envName} must be an ED25519 private key`);
        }
        return {
            keypair: Ed25519Keypair.fromSecretKey(secretKey),
            sourceEnv: envName,
        };
    }
    throw new Error(`Missing private key env. Expected one of: ${envNames.join(", ")}`);
}

export function parseCsvNumbers(value: string | undefined): number[] {
    if (!value) return [];
    return value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isFinite(part));
}

export function parseCsvBigints(value: string | undefined): bigint[] {
    if (!value) return [];
    return value
        .split(",")
        .map((part) => BigInt(part.trim()));
}

export function isDryRun(): boolean {
    return process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
}

export async function executeTransaction(
    client: SuiJsonRpcClient,
    signer: Ed25519Keypair,
    tx: Transaction
) {
    return client.signAndExecuteTransaction({
        transaction: tx,
        signer,
        options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
        },
    });
}

export async function executeSponsoredTransaction(
    tx: Transaction,
    client: SuiJsonRpcClient,
    playerKeypair: Ed25519Keypair,
    adminKeypair: Ed25519Keypair,
    playerAddress: string,
    adminAddress: string
) {
    const transactionKindBytes = await tx.build({ client, onlyTransactionKind: true });
    const gasCoins = await client.getCoins({
        owner: adminAddress,
        coinType: "0x2::sui::SUI",
        limit: 1,
    });

    if (gasCoins.data.length === 0) {
        throw new Error("Admin has no gas coins to sponsor the transaction");
    }

    const gasPayment = gasCoins.data.map((coin) => ({
        objectId: coin.coinObjectId,
        version: coin.version,
        digest: coin.digest,
    }));

    const sponsoredTx = Transaction.fromKind(transactionKindBytes);
    sponsoredTx.setSender(playerAddress);
    sponsoredTx.setGasOwner(adminAddress);
    sponsoredTx.setGasPayment(gasPayment);
    const transactionBytes = await sponsoredTx.build({ client });

    const playerSignature = await playerKeypair.signTransaction(transactionBytes);
    const adminSignature = await adminKeypair.signTransaction(transactionBytes);

    return client.executeTransactionBlock({
        transactionBlock: transactionBytes,
        signature: [playerSignature.signature, adminSignature.signature],
        options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
        },
    });
}

type TrustLockerEvent = {
    id?: { txDigest?: string; eventSeq?: string };
    type?: string;
    parsedJson?: Record<string, unknown>;
    sender?: string;
    timestampMs?: string;
    packageId?: string;
    transactionModule?: string;
};

export async function queryRecentTrustLockerEvents(args: {
    client: SuiJsonRpcClient;
    packageId: string;
    module?: string;
    limit?: number;
}): Promise<TrustLockerEvent[]> {
    const response = await args.client.queryEvents({
        query: {
            MoveModule: {
                package: args.packageId,
                module: args.module ?? "trust_locker",
            },
        },
        limit: args.limit ?? 20,
        order: "descending",
    });
    return (response.data ?? []) as TrustLockerEvent[];
}

type DevInspectArgs = {
    target: string;
    senderAddress: string;
    arguments: (tx: Transaction) => any[];
};

export async function devInspectMoveCallFirstReturnValueBytes(
    client: SuiJsonRpcClient,
    args: DevInspectArgs
): Promise<Uint8Array | null> {
    const tx = new Transaction();
    tx.moveCall({
        target: args.target,
        arguments: args.arguments(tx),
    });

    const result = await client.devInspectTransactionBlock({
        sender: args.senderAddress,
        transactionBlock: tx,
    });

    const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
    if (!bytes) return null;
    return new Uint8Array(bytes);
}

export async function getStorageUnitOwnerCapId(
    client: SuiJsonRpcClient,
    worldPackageId: string,
    storageUnitId: string,
    senderAddress: string
): Promise<string> {
    const bytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${worldPackageId}::storage_unit::owner_cap_id`,
        senderAddress,
        arguments: (tx) => [tx.object(storageUnitId)],
    });
    if (!bytes) {
        throw new Error(`Could not resolve StorageUnit owner cap for ${storageUnitId}`);
    }
    return bcs.Address.parse(bytes);
}

export async function getCharacterOwnerCapId(
    client: SuiJsonRpcClient,
    worldPackageId: string,
    characterId: string,
    senderAddress: string
): Promise<string> {
    const bytes = await devInspectMoveCallFirstReturnValueBytes(client, {
        target: `${worldPackageId}::character::owner_cap_id`,
        senderAddress,
        arguments: (tx) => [tx.object(characterId)],
    });
    if (!bytes) {
        throw new Error(`Could not resolve Character owner cap for ${characterId}`);
    }
    return bcs.Address.parse(bytes);
}

export async function getReceivingObjectRef(
    client: SuiJsonRpcClient,
    objectId: string
): Promise<{ objectId: string; version: string; digest: string }> {
    const object = await client.getObject({
        id: objectId,
        options: { showType: true },
    });
    const data = object.data;
    if (!data?.digest || data.version == null) {
        throw new Error(`Could not resolve object ref for ${objectId}`);
    }
    return {
        objectId,
        version: String(data.version),
        digest: data.digest,
    };
}

export function requireU64(value: number, label: string): bigint {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a non-negative number`);
    }
    return BigInt(value);
}

export function logHeading(title: string) {
    console.log(`\n============= ${title} =============\n`);
}

type PublishObjectChange = {
    type?: string;
    packageId?: string;
    objectId?: string;
    objectType?: string;
};

export function runSuiPublish(
    packagePath: string,
    network: Network,
    opts?: { withUnpublishedDependencies?: boolean }
): { output: any; outputRaw: string } {
    const args =
        network === "localnet"
            ? [
                  "client",
                  "test-publish",
                  "--build-env",
                  "testnet",
                  "--pubfile-path",
                  resolveLocalnetPubfilePath(),
                  "--json",
              ]
            : ["client", "publish", packagePath, "--json"];
    if (network !== "localnet" && opts?.withUnpublishedDependencies) {
        args.push("--with-unpublished-dependencies");
    }
    if (network !== "localnet") {
        args.unshift("--client.env", network);
    }
    const outputRaw = execFileSync("sui", args, {
        cwd: network === "localnet" ? packagePath : APP_ROOT,
        encoding: "utf8",
    });
    return {
        outputRaw,
        output: JSON.parse(outputRaw),
    };
}

function extractCreatedObjectIdsFromEffects(effects: any): string[] {
    const created = Array.isArray(effects?.created) ? effects.created : [];
    return created
        .map((entry: any) => entry?.reference?.objectId)
        .filter((id: unknown): id is string => typeof id === "string");
}

export async function extractPublishedTrustLockerIds(args: {
    publishOutput: any;
    client: SuiJsonRpcClient;
}): Promise<{ packageId: string; extensionConfigId: string; adminCapId?: string }> {
    const objectChanges: PublishObjectChange[] = Array.isArray(args.publishOutput?.objectChanges)
        ? args.publishOutput.objectChanges
        : [];

    const publishedPackageId =
        objectChanges.find((change) => change.type === "published")?.packageId ||
        extractCreatedObjectIdsFromEffects(args.publishOutput?.effects)[0];

    if (!publishedPackageId) {
        throw new Error("Could not determine published package id");
    }

    const extensionStructType = `${publishedPackageId}::config::ExtensionConfig`;
    const adminStructType = `${publishedPackageId}::config::AdminCap`;

    let extensionConfigId = objectChanges.find(
        (change) => change.type === "created" && change.objectType === extensionStructType
    )?.objectId;
    let adminCapId = objectChanges.find(
        (change) => change.type === "created" && change.objectType === adminStructType
    )?.objectId;

    if (!extensionConfigId) {
        const createdIds = extractCreatedObjectIdsFromEffects(args.publishOutput?.effects);
        if (createdIds.length > 0) {
            const objects = await args.client.multiGetObjects({
                ids: createdIds,
                options: { showType: true },
            });
            for (const object of objects) {
                const objectId = object.data?.objectId;
                const objectType = object.data?.type;
                if (!objectId || !objectType) continue;
                if (!extensionConfigId && objectType === extensionStructType) {
                    extensionConfigId = objectId;
                }
                if (!adminCapId && objectType === adminStructType) {
                    adminCapId = objectId;
                }
            }
        }
    }

    if (!extensionConfigId) {
        throw new Error("Could not find ExtensionConfig object id in publish output");
    }

    return {
        packageId: publishedPackageId,
        extensionConfigId,
        adminCapId,
    };
}

export function defaultDeploymentFromPublish(args: {
    network: Network;
    world: WorldObjectIds;
    worldSourcePath: string;
    trustLockerPackageId: string;
    extensionConfigId: string;
    adminCapId?: string;
    publishDigest?: string;
}): TrustLockerDeployment {
    const { data: resources } = loadTestResources();
    const deploymentFile = getTrustLockerDeploymentPath(args.network);
    const publishOutputFile = getTrustLockerPublishOutputPath(args.network);

    return {
        version: 1,
        network: args.network,
        tenant: DEFAULT_TENANT,
        rpcUrl: getRpcUrl(args.network),
        world: args.world,
        trustLocker: {
            packageId: args.trustLockerPackageId,
            extensionConfigId: args.extensionConfigId,
            adminCapId: args.adminCapId,
            publishDigest: args.publishDigest,
        },
        defaults: {
            storageUnitItemId: resources.storageUnit.itemId,
            ownerCharacterItemId: resources.character.gameCharacterId,
            visitorCharacterItemId: resources.character.gameCharacterBId,
            requestedTypeId: resources.item.typeId,
            offeredTypeId: resources.item.typeId,
            requestedQuantity: 1,
            fairOfferedQuantity: 1,
            dishonestOfferedQuantity: 0,
            friendlyTribes: [100],
            rivalTribes: [200],
            friendlyMultiplierBps: 9000,
            rivalMultiplierBps: 15000,
            cooldownMs: 60_000,
            isActive: true,
        },
        paths: {
            deploymentFile,
            publishOutputFile,
            worldSourceFile: args.worldSourcePath,
        },
        updatedAt: new Date().toISOString(),
    };
}

export function resolveRuntimeObjectIds(deployment: TrustLockerDeployment): {
    storageUnitId: string;
    ownerCharacterId: string;
    visitorCharacterId: string;
} {
    const objectRegistryId = deployment.world.objectRegistry;
    const worldPackageId = deployment.world.packageId;
    const tenant = deployment.tenant;

    return {
        storageUnitId: deriveWorldObjectId(
            objectRegistryId,
            BigInt(deployment.defaults.storageUnitItemId),
            worldPackageId,
            tenant
        ),
        ownerCharacterId: deriveWorldObjectId(
            objectRegistryId,
            BigInt(deployment.defaults.ownerCharacterItemId),
            worldPackageId,
            tenant
        ),
        visitorCharacterId: deriveWorldObjectId(
            objectRegistryId,
            BigInt(deployment.defaults.visitorCharacterItemId),
            worldPackageId,
            tenant
        ),
    };
}

export function boolFromEnv(envVar: string, defaultValue: boolean): boolean {
    const raw = process.env[envVar];
    if (!raw) return defaultValue;
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}
