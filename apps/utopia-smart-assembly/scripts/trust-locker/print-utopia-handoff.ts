import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_HOSTED_APP_URL = "https://evefrontier-b.pages.dev/";
const DEFAULT_UTOPIA_WORLD_PACKAGE_ID =
    "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";

function normalizeBaseUrl(value: string | undefined): string {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_HOSTED_APP_URL;
}

function buildViewUrl(baseUrl: string, itemId: string, view: "full" | "owner" | "visitor"): string {
    const url = new URL(baseUrl);
    url.searchParams.set("tenant", "utopia");
    url.searchParams.set("itemId", itemId);
    url.searchParams.set("view", view);
    return url.toString();
}

function readHostedConfig() {
    const worldPackageId =
        process.env.VITE_EVE_WORLD_PACKAGE_ID?.trim() || DEFAULT_UTOPIA_WORLD_PACKAGE_ID;
    const trustLockerPackageId = process.env.VITE_BARTER_BOX_PACKAGE_ID?.trim() || "";
    const extensionConfigId = process.env.VITE_BARTER_BOX_EXTENSION_CONFIG_ID?.trim() || "";
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

function main() {
    const itemId = process.env.ITEM_ID?.trim() ?? process.env.UTOPIA_ITEM_ID?.trim() ?? "";
    const baseUrl = normalizeBaseUrl(process.env.HOSTED_APP_URL);
    const config = readHostedConfig();

    console.log("Barter Box Utopia handoff");
    console.log("Workspace:", APP_ROOT);
    console.log("Hosted app:", baseUrl);
    console.log("World package:", config.worldPackageId || "(missing)");
    console.log("Barter Box package:", config.trustLockerPackageId || "(missing)");
    console.log("Extension config:", config.extensionConfigId || "(missing)");

    if (config.missing.length > 0) {
        console.log("Missing hosted config env vars:", config.missing.join(", "));
    }

    if (!itemId) {
        console.log("No ITEM_ID provided.");
        console.log("Usage:");
        console.log("  ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-handoff");
        console.log("Optional:");
        console.log("  HOSTED_APP_URL=https://evefrontier-b.pages.dev/");
        process.exitCode = 1;
        return;
    }

    console.log("Controlled unit itemId:", itemId);
    console.log("Admin URL:", buildViewUrl(baseUrl, itemId, "full"));
    console.log("Owner URL:", buildViewUrl(baseUrl, itemId, "owner"));
    console.log("Visitor URL:", buildViewUrl(baseUrl, itemId, "visitor"));
    console.log("Next checks:");
    console.log("  1. Open Owner URL and confirm live state resolves.");
    console.log("  2. Execute one policy save.");
    console.log("  3. Execute one Stock shelf.");
    console.log("  4. Execute one Visitor trade.");
    console.log("  5. If procurement mode is active, execute one Claim or Restock.");
}

main();
