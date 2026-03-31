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

  console.log("Barter Box controlled Utopia checklist");
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
    console.log("  ITEM_ID=<utopia storage unit item id> pnpm locker:print-utopia-checklist");
    process.exitCode = 1;
    return;
  }

  const adminUrl = buildViewUrl(baseUrl, itemId, "full");
  const ownerUrl = buildViewUrl(baseUrl, itemId, "owner");
  const visitorUrl = buildViewUrl(baseUrl, itemId, "visitor");

  console.log("Controlled unit itemId:", itemId);
  console.log("Admin URL:", adminUrl);
  console.log("Owner URL:", ownerUrl);
  console.log("Visitor URL:", visitorUrl);

  console.log("Operator checklist:");
  console.log("  1. Open Admin URL and record the onchain owner character ID.");
  console.log("  2. Open Owner URL and select the owner-matching wallet character if prompted.");
  console.log("  3. Capture the selected owner character ID before any owner write.");
  console.log("  4. Execute one owner policy save and record the transaction digest.");
  console.log("  5. Execute one Stock shelf action and record the transaction digest.");
  console.log("  6. Open Visitor URL with a non-owner visitor character selected.");
  console.log("  7. Capture the selected visitor character ID before the visitor trade.");
  console.log("  8. Execute one visitor trade and record the transaction digest.");
  console.log("  9. If procurement mode is active, execute one Claim or Restock and record the digest.");
  console.log("  10. After browser proof succeeds, set the unit custom URL and repeat the flow in-game with F.");

  console.log("Required proof captures:");
  console.log("  - controlled unit itemId");
  console.log("  - onchain owner character ID");
  console.log("  - selected owner character ID for owner actions");
  console.log("  - selected visitor character ID for visitor trade");
  console.log("  - owner policy-save digest");
  console.log("  - stock-shelf digest");
  console.log("  - visitor-trade digest");
  console.log("  - procurement claim/restock digest if procurement is demonstrated");
  console.log("  - in-game F screenshot and hosted URL evidence");
}

main();
