import { TENANT_CONFIG } from "@evefrontier/dapp-kit";
import type { LockerRuntimeContext, UiMode } from "./models";

const DEFAULT_UTOPIA_RPC_URL = "https://fullnode.testnet.sui.io:443";

function normalizeId(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isLocalRuntimeHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

export function getUtopiaWorldPackageId(): string {
  return normalizeId(import.meta.env.VITE_EVE_WORLD_PACKAGE_ID) || TENANT_CONFIG.utopia.packageId;
}

export function getUtopiaRpcUrl(): string {
  return normalizeId(import.meta.env.VITE_SUI_RPC_URL) || DEFAULT_UTOPIA_RPC_URL;
}

export function readHostedUtopiaConfig(): {
  worldPackageId: string;
  trustLockerPackageId: string;
  extensionConfigId: string;
  missing: string[];
} {
  const worldPackageId = getUtopiaWorldPackageId();
  const trustLockerPackageId = normalizeId(import.meta.env.VITE_BARTER_BOX_PACKAGE_ID);
  const extensionConfigId = normalizeId(import.meta.env.VITE_BARTER_BOX_EXTENSION_CONFIG_ID);
  const missing: string[] = [];

  if (!trustLockerPackageId) missing.push("VITE_BARTER_BOX_PACKAGE_ID");
  if (!extensionConfigId) missing.push("VITE_BARTER_BOX_EXTENSION_CONFIG_ID");

  return {
    worldPackageId,
    trustLockerPackageId,
    extensionConfigId,
    missing,
  };
}

export function buildHostedUtopiaRuntime(args: {
  assemblyId: string;
  ownerCharacterId?: string | null;
  visitorCharacterId?: string | null;
  tenant?: string | null;
  defaultViewMode?: UiMode;
}): LockerRuntimeContext {
  const config = readHostedUtopiaConfig();
  return {
    network: "utopia",
    rpcUrl: getUtopiaRpcUrl(),
    tenant: args.tenant ?? "utopia",
    lockerId: args.assemblyId,
    ownerCharacterId: args.ownerCharacterId?.trim() ?? "",
    visitorCharacterId: args.visitorCharacterId?.trim() ?? null,
    extensionConfigId: config.extensionConfigId,
    trustLockerPackageId: config.trustLockerPackageId,
    worldPackageId: config.worldPackageId,
    defaultViewMode: args.defaultViewMode ?? "visitor",
  };
}
