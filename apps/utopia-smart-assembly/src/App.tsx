import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  abbreviateAddress,
  getCharacterOwnedObjects,
  getObjectsByType,
  TENANT_CONFIG,
  useConnection,
  useSmartObject,
} from "@evefrontier/dapp-kit";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import {
  PRODUCT_WORKING_NAME,
  TRUST_LOCKER_CATALOG,
  type LockerPolicyDraft,
  type MarketMode,
} from "../trust-locker.config";
import {
  claimReceipts,
  createLocalDemoSignerExecutor,
  executeTrade,
  freezeLockerPolicy,
  restockFromClaimable,
  stockShelf,
  updateStrikeNetworkPolicy,
  updateLockerPolicy,
  type WalletTxExecutor,
} from "./liveLocalnet";
import { resolveLockerData } from "./lockerDataProvider";
import type {
  LockerDataEnvelope,
  RuntimeEnvironment,
  UiCapabilities,
  UiMode,
} from "./models";
import { quoteTradePreview } from "./trustMath";

const LOCAL_DEMO_SIGNER_STORAGE_KEY = "trust-locker.local-demo-signer.v1";
const VIEW_MODE_STORAGE_KEY = "trust-locker.view-mode.v1";
const DEFAULT_TENANT = "utopia";
const VIEW_SEQUENCE: UiMode[] = ["visitor", "owner", "full"];

type LocalDemoSignerDraft = {
  ownerSecretKey: string;
  visitorSecretKey: string;
};

type LocalSignerResolution = {
  address: string | null;
  executor: WalletTxExecutor | null;
  error: string | null;
  configured: boolean;
};

type OwnedObjectCandidate = {
  itemId: string;
  typeId: string;
  name: string;
  tenant: string;
  objectId?: string;
  source: "owned" | "public";
};

type OwnerPolicyForm = {
  enabledTypeIds: number[];
  pointsByTypeId: Record<number, number>;
  friendlyTribesText: string;
  rivalTribesText: string;
  friendlyMultiplierBps: number;
  rivalMultiplierBps: number;
  marketMode: MarketMode;
  fuelFeeUnits: number;
  cooldownMs: number;
  strikeScopeId: number;
  useSharedPenalties: boolean;
  isActive: boolean;
};

type SharedNetworkPolicyForm = {
  scopeId: number;
  pricingPenaltyPerStrikeBps: number;
  maxPricingPenaltyBps: number;
  lockoutStrikeThreshold: number;
  networkLockoutDurationMs: number;
  isActive: boolean;
};

type ActionState = {
  status: "idle" | "blocked" | "pending" | "success" | "error";
  label: string;
  message?: string;
  digest?: string;
};

type ViewDefinition = {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

type VisitorWorkspaceTab = "trade" | "terms" | "status";
type OwnerWorkspaceTab = "goods" | "inventory" | "terms" | "network" | "publish";
type FullWorkspaceTab = "overview" | "trade" | "owner" | "signals" | "proof";
type FullRailPanel = "shelf" | "hold" | "reserve";
type InventoryActionKind = "stock" | "claim" | "restock";

type WorkspaceTabDefinition<T extends string> = {
  id: T;
  label: string;
};

const VISITOR_WORKSPACE_TABS: WorkspaceTabDefinition<VisitorWorkspaceTab>[] = [
  { id: "trade", label: "Trade" },
  { id: "terms", label: "Rules" },
  { id: "status", label: "Status" },
];

const OWNER_WORKSPACE_TABS: WorkspaceTabDefinition<OwnerWorkspaceTab>[] = [
  { id: "goods", label: "Goods" },
  { id: "inventory", label: "Inventory" },
  { id: "terms", label: "Market settings" },
  { id: "network", label: "Trust network" },
  { id: "publish", label: "Publish" },
];

const FULL_WORKSPACE_TABS: WorkspaceTabDefinition<FullWorkspaceTab>[] = [
  { id: "overview", label: "Overview" },
  { id: "trade", label: "Trade" },
  { id: "owner", label: "Owner" },
  { id: "signals", label: "Signals" },
  { id: "proof", label: "Proof" },
];

function numbersToCsv(values: number[]): string {
  return values.join(", ");
}

function csvToNumbers(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}

function buildOwnerPolicyForm(policy: LockerPolicyDraft): OwnerPolicyForm {
  return {
    enabledTypeIds: policy.acceptedItems.map((item) => item.typeId),
    pointsByTypeId: Object.fromEntries(
      TRUST_LOCKER_CATALOG.map((item) => [
        item.typeId,
        policy.acceptedItems.find((accepted) => accepted.typeId === item.typeId)?.points ?? item.points,
      ]),
    ),
    friendlyTribesText: numbersToCsv(policy.friendlyTribes),
    rivalTribesText: numbersToCsv(policy.rivalTribes),
    friendlyMultiplierBps: policy.friendlyMultiplierBps,
    rivalMultiplierBps: policy.rivalMultiplierBps,
    marketMode: policy.marketMode,
    fuelFeeUnits: policy.fuelFeeUnits,
    cooldownMs: policy.cooldownMs,
    strikeScopeId: policy.strikeScopeId,
    useSharedPenalties: policy.useSharedPenalties,
    isActive: policy.isActive,
  };
}

function buildSharedNetworkPolicyForm(snapshot: LockerDataEnvelope["snapshot"]): SharedNetworkPolicyForm {
  return {
    scopeId: snapshot.policy.strikeScopeId,
    pricingPenaltyPerStrikeBps: snapshot.sharedPenalty.policy.pricingPenaltyPerStrikeBps,
    maxPricingPenaltyBps: snapshot.sharedPenalty.policy.maxPricingPenaltyBps,
    lockoutStrikeThreshold: snapshot.sharedPenalty.policy.lockoutStrikeThreshold,
    networkLockoutDurationMs: snapshot.sharedPenalty.policy.networkLockoutDurationMs,
    isActive: snapshot.sharedPenalty.policy.isActive,
  };
}

function buildDraftFromForm(form: OwnerPolicyForm): LockerPolicyDraft {
  const acceptedItems = TRUST_LOCKER_CATALOG
    .filter((item) => form.enabledTypeIds.includes(item.typeId))
    .map((item) => ({
      ...item,
      points: Math.max(1, Number(form.pointsByTypeId[item.typeId] ?? item.points)),
    }));

  return {
    acceptedItems,
    friendlyTribes: csvToNumbers(form.friendlyTribesText),
    rivalTribes: csvToNumbers(form.rivalTribesText),
    friendlyMultiplierBps: Math.max(0, Number(form.friendlyMultiplierBps)),
    rivalMultiplierBps: Math.max(0, Number(form.rivalMultiplierBps)),
    marketMode: form.marketMode,
    fuelFeeUnits: Math.max(0, Number(form.fuelFeeUnits)),
    cooldownMs: Math.max(0, Number(form.cooldownMs)),
    strikeScopeId: Math.max(0, Number(form.strikeScopeId)),
    useSharedPenalties: form.useSharedPenalties,
    isActive: form.isActive,
    isFrozen: false,
  };
}

function buildRiskLabel(policy: LockerPolicyDraft): string {
  if (policy.marketMode === "procurement") return "Procurement claim mode";
  if (policy.useSharedPenalties) return "Federated trust network";
  if (policy.rivalMultiplierBps >= 13_000) return "Hostile rival pricing";
  if (policy.friendlyMultiplierBps < 10_000) return "Preferential friendly pricing";
  return "Balanced published pricing";
}

function marketModeLabel(mode: MarketMode): string {
  return mode === "procurement" ? "Procurement Market" : "Perpetual Market";
}

function marketModeCopy(mode: MarketMode): string {
  return mode === "procurement"
    ? "Visitor payments become claimable by the owner instead of returning to the public shelf."
    : "Visitor goods return to the public shelf so later visitors can trade for them.";
}

function formatCooldownCountdown(
  cooldownEndTimestampMs?: number | null,
  nowMs = Date.now(),
  inactiveLabel = "No active cooldown",
  expiredLabel = "Cooldown expired",
): string {
  if (!cooldownEndTimestampMs || cooldownEndTimestampMs <= 0) {
    return inactiveLabel;
  }

  const delta = cooldownEndTimestampMs - nowMs;
  if (delta <= 0) {
    return expiredLabel;
  }

  const seconds = Math.ceil(delta / 1000);
  return `${seconds}s remaining`;
}

function readTenantFromLocation(): string {
  if (typeof window === "undefined") return DEFAULT_TENANT;
  return new URLSearchParams(window.location.search).get("tenant") ?? DEFAULT_TENANT;
}

function formatVolume(volumeM3: number, quantity = 1): string {
  const total = volumeM3 * quantity;
  if (total >= 10) return `${total.toFixed(0)} m3`;
  if (total >= 1) return `${total.toFixed(1)} m3`;
  return `${total.toFixed(2)} m3`;
}

function formatMultiplierValue(bps: number): string {
  return `${(bps / 10000).toFixed(2)}x`;
}

function parseMultiplierInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10000));
}

function compactAddress(value: string, short = false): string {
  if (!value) return "n/a";
  return short ? abbreviateAddress(value) : value;
}

function normalizeViewMode(value: string | null | undefined): UiMode | null {
  if (value === "full" || value === "owner" || value === "visitor") return value;
  return null;
}

function readInitialViewMode(): UiMode {
  if (typeof window === "undefined") return "full";
  const fromQuery = normalizeViewMode(new URLSearchParams(window.location.search).get("view"));
  if (fromQuery) return fromQuery;
  const fromStorage = normalizeViewMode(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  return fromStorage ?? "full";
}

function writeViewMode(mode: UiMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  const url = new URL(window.location.href);
  url.searchParams.set("view", mode);
  window.history.replaceState({}, "", url);
}

function buildAssemblyViewUrl(itemId: string, tenant: string, view: UiMode): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("tenant", tenant);
  url.searchParams.set("itemId", itemId);
  url.searchParams.set("view", view);
  return url.toString();
}

function cycleViewMode(current: UiMode): UiMode {
  const index = VIEW_SEQUENCE.indexOf(current);
  return VIEW_SEQUENCE[(index + 1) % VIEW_SEQUENCE.length] ?? "visitor";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseOwnedObjectCandidates(objects: Record<string, unknown>[] | undefined): OwnedObjectCandidate[] {
  if (!objects) return [];

  const candidates: OwnedObjectCandidate[] = [];
  for (const entry of objects) {
    const record = asRecord(entry);
    const key = asRecord(record?.key);
    const metadata = asRecord(record?.metadata);
    const itemId = typeof key?.item_id === "string" ? key.item_id : null;
    if (!itemId) continue;

    candidates.push({
      itemId,
      tenant: key && typeof key.tenant === "string" ? key.tenant : "utopia",
      typeId: typeof record?.type_id === "string" ? record.type_id : "unknown",
      name: typeof metadata?.name === "string" && metadata.name.length > 0
        ? metadata.name
        : `Object ${itemId}`,
      objectId: typeof record?.id === "string" ? record.id : undefined,
      source: "owned",
    });
  }

  return candidates;
}

type PublicAssemblyQuery = {
  label: string;
  moveType: string;
};

function parsePublicObjectCandidates(
  objects: Array<{
    address?: string;
    asMoveObject?: {
      contents?: {
        json?: Record<string, unknown>;
      } | null;
    } | null;
  }> | undefined,
): OwnedObjectCandidate[] {
  if (!objects) return [];

  const candidates: OwnedObjectCandidate[] = [];
  for (const entry of objects) {
    const record = asRecord(entry.asMoveObject?.contents?.json);
    const key = asRecord(record?.key);
    const metadata = asRecord(record?.metadata);
    const itemId = typeof key?.item_id === "string" ? key.item_id : null;
    if (!itemId) continue;

    candidates.push({
      itemId,
      tenant: key && typeof key.tenant === "string" ? key.tenant : "utopia",
      typeId: typeof record?.type_id === "string" ? record.type_id : "unknown",
      name:
        typeof metadata?.name === "string" && metadata.name.length > 0
          ? metadata.name
          : `Public object ${itemId}`,
      objectId: typeof entry.address === "string" ? entry.address : undefined,
      source: "public",
    });
  }

  return candidates;
}

function readStoredLocalDemoSignerDraft(): LocalDemoSignerDraft {
  if (typeof window === "undefined") {
    return {
      ownerSecretKey: "",
      visitorSecretKey: "",
    };
  }

  try {
    const raw = window.sessionStorage.getItem(LOCAL_DEMO_SIGNER_STORAGE_KEY);
    if (!raw) {
      return {
        ownerSecretKey: "",
        visitorSecretKey: "",
      };
    }

    const parsed = JSON.parse(raw) as Partial<LocalDemoSignerDraft>;
    return {
      ownerSecretKey: typeof parsed.ownerSecretKey === "string" ? parsed.ownerSecretKey : "",
      visitorSecretKey: typeof parsed.visitorSecretKey === "string" ? parsed.visitorSecretKey : "",
    };
  } catch {
    return {
      ownerSecretKey: "",
      visitorSecretKey: "",
    };
  }
}

function resolveLocalSigner(secretKey: string): LocalSignerResolution {
  const normalized = secretKey.trim();
  if (!normalized) {
    return {
      address: null,
      executor: null,
      error: null,
      configured: false,
    };
  }

  try {
    const signer = createLocalDemoSignerExecutor(normalized);
    return {
      address: signer.address,
      executor: signer.signAndExecuteTransaction,
      error: null,
      configured: true,
    };
  } catch (error) {
    return {
      address: null,
      executor: null,
      error: error instanceof Error ? error.message : String(error),
      configured: true,
    };
  }
}

function StepHeader(props: { step?: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      {props.step ? <p className="step-index">{props.step}</p> : null}
      <div>
        <p className="section-label">{props.title}</p>
        <p className="section-copy">{props.description}</p>
      </div>
    </div>
  );
}

function App() {
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const { assembly, assemblyOwner, loading, error } = useSmartObject();

  const [lockerData, setLockerData] = useState<LockerDataEnvelope | null>(null);
  const [viewMode, setViewMode] = useState<UiMode>(readInitialViewMode);
  const [visitorWorkspaceTab, setVisitorWorkspaceTab] = useState<VisitorWorkspaceTab>("trade");
  const [ownerWorkspaceTab, setOwnerWorkspaceTab] = useState<OwnerWorkspaceTab>("goods");
  const [fullWorkspaceTab, setFullWorkspaceTab] = useState<FullWorkspaceTab>("overview");
  const [fullRailPanel, setFullRailPanel] = useState<FullRailPanel>("shelf");
  const [isResolvingData, setIsResolvingData] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [ownerPolicyForm, setOwnerPolicyForm] = useState<OwnerPolicyForm | null>(null);
  const [sharedNetworkPolicyForm, setSharedNetworkPolicyForm] = useState<SharedNetworkPolicyForm | null>(null);
  const [requestedTypeId, setRequestedTypeId] = useState<number>(0);
  const [requestedQuantity, setRequestedQuantity] = useState<number>(1);
  const [offeredTypeId, setOfferedTypeId] = useState<number>(0);
  const [offeredQuantity, setOfferedQuantity] = useState<number>(1);
  const [inventoryActionQuantities, setInventoryActionQuantities] = useState<Record<string, number>>({});
  const [localDemoSignerDraft, setLocalDemoSignerDraft] = useState<LocalDemoSignerDraft>(
    readStoredLocalDemoSignerDraft,
  );
  const [localDemoSignerMessage, setLocalDemoSignerMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ownedObjectCandidates, setOwnedObjectCandidates] = useState<OwnedObjectCandidate[]>([]);
  const [isLoadingOwnedObjects, setIsLoadingOwnedObjects] = useState(false);
  const [ownedObjectsMessage, setOwnedObjectsMessage] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
    label: "No wallet action yet.",
  });

  const ownerLocalSigner = useMemo(
    () => resolveLocalSigner(localDemoSignerDraft.ownerSecretKey),
    [localDemoSignerDraft.ownerSecretKey],
  );
  const visitorLocalSigner = useMemo(
    () => resolveLocalSigner(localDemoSignerDraft.visitorSecretKey),
    [localDemoSignerDraft.visitorSecretKey],
  );
  const preferredReaderAddress =
    account?.address ?? ownerLocalSigner.address ?? visitorLocalSigner.address ?? null;
  const tenant = readTenantFromLocation();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsResolvingData(true);
      const envelope = await resolveLockerData({
        assemblyId: assembly?.id,
        assemblyName: assembly?.name,
        assemblyOwner: assemblyOwner
          ? {
              id: assemblyOwner.id,
              name: assemblyOwner.name,
              address: assemblyOwner.address,
            }
          : null,
        smartObjectError: error ? String(error) : null,
        walletAddress: preferredReaderAddress,
        tenant,
        viewMode,
      });
      if (!cancelled) {
        setLockerData(envelope);
        setIsResolvingData(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [assembly?.id, assembly?.name, assemblyOwner?.address, assemblyOwner?.id, assemblyOwner?.name, error, preferredReaderAddress, refreshTick, tenant, viewMode]);

  const snapshot = lockerData?.snapshot;
  const runtime = lockerData?.runtime;
  const runtimeEnvironment: RuntimeEnvironment = lockerData?.runtimeEnvironment ?? "utopia-browser";
  const uiCapabilities: UiCapabilities = lockerData?.capabilities ?? {
    showDemoSigner: false,
    showDiscovery: false,
    showSignals: false,
    showSupportCopy: false,
    showAdvancedOwnerControls: false,
    showLocalnetProofNotes: false,
    showActionStatusPanel: false,
    showVisitorWorkspace: false,
    showOwnerWorkspace: false,
    showGuidedFullFlow: false,
  };
  const isVisitorMode = viewMode === "visitor";
  const isOwnerMode = viewMode === "owner";
  const isFullMode = viewMode === "full";
  const showLocalDemoSignerPanel = uiCapabilities.showDemoSigner;
  const showDiscoveryPanel = uiCapabilities.showDiscovery;
  const showSignalsPanel = uiCapabilities.showSignals;
  const showSupportCopy = uiCapabilities.showSupportCopy;
  const showAdvancedOwnerControls = uiCapabilities.showAdvancedOwnerControls;
  const showVisitorWorkspace = uiCapabilities.showVisitorWorkspace;
  const showOwnerWorkspace = uiCapabilities.showOwnerWorkspace;

  function resolveActorExecution(role: "owner" | "visitor"): {
    senderAddress: string;
    executor: WalletTxExecutor;
    mode: "local-demo-signer" | "wallet";
  } | null {
    if (showLocalDemoSignerPanel) {
      const localSigner = role === "owner" ? ownerLocalSigner : visitorLocalSigner;
      if (localSigner.executor && localSigner.address) {
        return {
          senderAddress: localSigner.address,
          executor: localSigner.executor,
          mode: "local-demo-signer",
        };
      }
    }

    if (account?.address) {
      return {
        senderAddress: account.address,
        executor: dAppKit.signAndExecuteTransaction,
        mode: "wallet",
      };
    }

    return null;
  }

  const ownerActor = resolveActorExecution("owner");
  const visitorActor = resolveActorExecution("visitor");

  useEffect(() => {
    if (!snapshot) return;
    const initialRequestedTypeId = snapshot.openInventory[0]?.typeId ?? snapshot.policy.acceptedItems[0]?.typeId ?? 0;
    const initialOfferedTypeId =
      snapshot.visitorInventory.find((item) => item.typeId !== initialRequestedTypeId)?.typeId ??
      snapshot.visitorInventory[0]?.typeId ??
      snapshot.policy.acceptedItems.find((item) => item.typeId !== initialRequestedTypeId)?.typeId ??
      snapshot.policy.acceptedItems[0]?.typeId ??
      0;
    setNowMs(Date.now());
    setOwnerPolicyForm(buildOwnerPolicyForm(snapshot.policy));
    setSharedNetworkPolicyForm(buildSharedNetworkPolicyForm(snapshot));
    setRequestedTypeId(initialRequestedTypeId);
    setOfferedTypeId(initialOfferedTypeId);
    setRequestedQuantity(1);
    setOfferedQuantity(snapshot.visitorInventory[0] ? 1 : 0);
    setInventoryActionQuantities({});
  }, [snapshot]);

  useEffect(() => {
    const localCooldownEndTimestampMs = snapshot?.visitor.localCooldownEndTimestampMs;
    const sharedCooldownEndTimestampMs = snapshot?.sharedPenalty.penalties.networkCooldownEndTimestampMs;
    const hasActiveTimer =
      (localCooldownEndTimestampMs != null && localCooldownEndTimestampMs > Date.now()) ||
      (sharedCooldownEndTimestampMs != null && sharedCooldownEndTimestampMs > Date.now());

    if (!hasActiveTimer) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    snapshot?.sharedPenalty.penalties.networkCooldownEndTimestampMs,
    snapshot?.visitor.localCooldownEndTimestampMs,
  ]);

  useEffect(() => {
    writeViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      setViewMode((current) => cycleViewMode(current));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const acceptedItems = snapshot?.policy.acceptedItems ?? [];
  const requestedItem =
    snapshot?.openInventory.find((item) => item.typeId === requestedTypeId) ??
    acceptedItems.find((item) => item.typeId === requestedTypeId) ??
    snapshot?.openInventory[0] ??
    acceptedItems[0];
  const offeredItem =
    snapshot?.visitorInventory.find((item) => item.typeId === offeredTypeId) ??
    acceptedItems.find((item) => item.typeId === offeredTypeId) ??
    snapshot?.visitorInventory[0] ??
    acceptedItems[0];
  const requestedShelfEntry =
    snapshot?.openInventory.find((item) => item.typeId === requestedTypeId) ??
    snapshot?.openInventory[0];
  const offeredHoldEntry =
    snapshot?.visitorInventory.find((item) => item.typeId === offeredTypeId) ??
    snapshot?.visitorInventory[0];

  const preview = useMemo(() => {
    if (!snapshot || !requestedItem || !offeredItem) return null;
    return quoteTradePreview({
      policy: snapshot.policy,
      relationshipBucket: snapshot.visitor.relationshipBucket,
      requestedItem,
      requestedQuantity,
      offeredItem,
      offeredQuantity,
      sharedPenalty: snapshot.sharedPenalty,
    });
  }, [offeredItem, offeredQuantity, requestedItem, requestedQuantity, snapshot]);

  async function refreshLockerContext() {
    setRefreshTick((value) => value + 1);
  }

  function openCandidateInView(candidate: OwnedObjectCandidate, nextView: UiMode) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextView);
    window.location.assign(
      buildAssemblyViewUrl(candidate.itemId, candidate.tenant || "utopia", nextView),
    );
  }

  async function runWalletAction(
    label: string,
    action: () => Promise<string>,
    pendingMessage = "Awaiting wallet confirmation...",
  ) {
    setActionState({
      status: "pending",
      label,
      message: pendingMessage,
    });

    try {
      const digest = await action();
      setActionState({
        status: "success",
        label,
        digest,
        message: "Transaction executed successfully.",
      });
      await refreshLockerContext();
    } catch (actionError) {
      setActionState({
        status: "error",
        label,
        message: actionError instanceof Error ? actionError.message : String(actionError),
      });
    }
  }

  function setBlockedAction(label: string, message: string) {
    setActionState({
      status: "blocked",
      label,
      message,
    });
  }

  function inventoryActionKey(kind: InventoryActionKind, typeId: number) {
    return `${kind}:${typeId}`;
  }

  function readInventoryActionQuantity(kind: InventoryActionKind, typeId: number): number {
    return inventoryActionQuantities[inventoryActionKey(kind, typeId)] ?? 1;
  }

  function updateInventoryActionQuantity(kind: InventoryActionKind, typeId: number, value: string) {
    const parsed = Math.max(0, Number(value) || 0);
    setInventoryActionQuantities((current) => ({
      ...current,
      [inventoryActionKey(kind, typeId)]: parsed,
    }));
  }

  function persistLocalDemoSignerDraft() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        LOCAL_DEMO_SIGNER_STORAGE_KEY,
        JSON.stringify(localDemoSignerDraft),
      );
    }
    setLocalDemoSignerMessage("Local demo signer secrets saved to this browser session.");
  }

  function clearLocalDemoSignerDraft() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LOCAL_DEMO_SIGNER_STORAGE_KEY);
    }
    setLocalDemoSignerDraft({
      ownerSecretKey: "",
      visitorSecretKey: "",
    });
    setLocalDemoSignerMessage("Local demo signer secrets cleared from this browser session.");
  }

  async function loadOwnedObjectsForConnectedWallet() {
    if (!account?.address) {
      setOwnedObjectsMessage("Connect EVE Vault or another real wallet before loading owned objects.");
      return;
    }

    setIsLoadingOwnedObjects(true);
    setOwnedObjectsMessage("Loading owned objects from the connected wallet...");
    try {
      const objects = await getCharacterOwnedObjects(account.address);
      const candidates = parseOwnedObjectCandidates(objects);
      setOwnedObjectCandidates(candidates);
      setOwnedObjectsMessage(
        candidates.length > 0
          ? `Loaded ${candidates.length} owned object candidate(s).`
          : "No owned objects with item_id were returned for the connected wallet.",
      );
    } catch (loadError) {
      setOwnedObjectsMessage(loadError instanceof Error ? loadError.message : String(loadError));
      setOwnedObjectCandidates([]);
    } finally {
      setIsLoadingOwnedObjects(false);
    }
  }

  async function loadPublicUtopiaObjects() {
    const utopiaWorldPackage = TENANT_CONFIG.utopia.packageId;
    const assemblyQueries: PublicAssemblyQuery[] = [
      {
        label: "Storage Units",
        moveType: `${utopiaWorldPackage}::storage_unit::StorageUnit`,
      },
      {
        label: "Gates",
        moveType: `${utopiaWorldPackage}::gate::Gate`,
      },
      {
        label: "Network Nodes",
        moveType: `${utopiaWorldPackage}::network_node::NetworkNode`,
      },
    ];

    setIsLoadingOwnedObjects(true);
    setOwnedObjectsMessage("Loading public Utopia object candidates from GraphQL...");
    try {
      const settled = await Promise.all(
        assemblyQueries.map(async (query) => {
          const result = await getObjectsByType(query.moveType, { first: 8 });
          return {
            label: query.label,
            candidates: parsePublicObjectCandidates(result.data?.objects?.nodes),
          };
        }),
      );

      const deduped = new Map<string, OwnedObjectCandidate>();
      const sourceSummaries: string[] = [];

      for (const result of settled) {
        sourceSummaries.push(`${result.label}: ${result.candidates.length}`);
        for (const candidate of result.candidates) {
          deduped.set(`${candidate.tenant}:${candidate.itemId}`, candidate);
        }
      }

      const candidates = Array.from(deduped.values());
      setOwnedObjectCandidates(candidates);
      setOwnedObjectsMessage(
        candidates.length > 0
          ? `Loaded ${candidates.length} public Utopia candidate(s). ${sourceSummaries.join(" | ")}`
          : `No public Utopia objects were returned. ${sourceSummaries.join(" | ")}`,
      );
    } catch (loadError) {
      setOwnedObjectsMessage(loadError instanceof Error ? loadError.message : String(loadError));
      setOwnedObjectCandidates([]);
    } finally {
      setIsLoadingOwnedObjects(false);
    }
  }

  async function handlePolicySave() {
    const actor = resolveActorExecution("owner");
    if (!runtime || !runtime.ownerCharacterId || !ownerPolicyForm || !actor) {
      setBlockedAction(
        "Save policy",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load the live Barter Box runtime before saving policy.",
      );
      return;
    }

    const draft = buildDraftFromForm(ownerPolicyForm);
    if (draft.fuelFeeUnits > 0) {
      setBlockedAction(
        "Save policy",
        "Fuel fees are still deferred. Set the trade fee to 0 until a real Fuel debit path is proven.",
      );
      return;
    }
    await runWalletAction(
      actor.mode === "local-demo-signer" ? "Save policy (local demo signer)" : "Save policy",
      () =>
        updateLockerPolicy({
          runtime,
          senderAddress: actor.senderAddress,
          draft,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleFreeze() {
    const actor = resolveActorExecution("owner");
    if (!runtime || !runtime.ownerCharacterId || !actor) {
      setBlockedAction(
        "Freeze locker",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load the live Barter Box runtime before freezing.",
      );
      return;
    }

    if (!window.confirm("Freeze this locker policy permanently? This cannot be undone.")) {
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer" ? "Freeze locker (local demo signer)" : "Freeze locker",
      () =>
        freezeLockerPolicy({
          runtime,
          senderAddress: actor.senderAddress,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleSharedNetworkPolicySave() {
    const actor = resolveActorExecution("owner");
    if (!runtime || !runtime.ownerCharacterId || !sharedNetworkPolicyForm || !actor) {
      setBlockedAction(
        "Save strike network",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load the live Barter Box runtime before saving trust-network settings.",
      );
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer"
        ? "Save strike network (local demo signer)"
        : "Save strike network",
      () =>
        updateStrikeNetworkPolicy({
          runtime,
          senderAddress: actor.senderAddress,
          strikeScopeId: Math.max(0, Number(sharedNetworkPolicyForm.scopeId)),
          pricingPenaltyPerStrikeBps: Math.max(
            0,
            Number(sharedNetworkPolicyForm.pricingPenaltyPerStrikeBps),
          ),
          maxPricingPenaltyBps: Math.max(0, Number(sharedNetworkPolicyForm.maxPricingPenaltyBps)),
          lockoutStrikeThreshold: Math.max(
            1,
            Number(sharedNetworkPolicyForm.lockoutStrikeThreshold),
          ),
          networkLockoutDurationMs: Math.max(
            0,
            Number(sharedNetworkPolicyForm.networkLockoutDurationMs),
          ),
          isActive: sharedNetworkPolicyForm.isActive,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleTrade() {
    const actor = resolveActorExecution("visitor");
    if (sameItemSelected) {
      setBlockedAction(
        "Execute trade",
        "Choose two different goods before trading. Same-item trades are disabled in v1.",
      );
      return;
    }

    if (!runtime || !runtime.visitorCharacterId || !actor || !requestedItem || !offeredItem) {
      setBlockedAction(
        "Execute trade",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local visitor demo signer, or connect a visitor-capable wallet."
          : "Connect a wallet with a live character and load the live Barter Box runtime before trading.",
      );
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer" ? "Execute trade (local demo signer)" : "Execute trade",
      () =>
        executeTrade({
          runtime,
          senderAddress: actor.senderAddress,
          requestedTypeId: requestedItem.typeId,
          requestedQuantity,
          offeredTypeId: offeredItem.typeId,
          offeredQuantity,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured visitor demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleStockShelf(typeId: number) {
    const actor = resolveActorExecution("owner");
    const quantity = readInventoryActionQuantity("stock", typeId);
    const item = resolvedSnapshot.ownerCargoInventory.find((entry) => entry.typeId === typeId);
    if (!runtime || !runtime.ownerCharacterId || !actor) {
      setBlockedAction(
        "Stock shelf",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load a live Barter Box before stocking shelf items.",
      );
      return;
    }
    if (!item) {
      setBlockedAction("Stock shelf", "This item is not currently available in your cargo for this box.");
      return;
    }
    if (quantity <= 0) {
      setBlockedAction("Stock shelf", "Stock quantity must be greater than zero.");
      return;
    }
    if (quantity > item.quantity) {
      setBlockedAction("Stock shelf", "Stock quantity exceeds the cargo available in this box.");
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer" ? "Stock shelf (local demo signer)" : "Stock shelf",
      () =>
        stockShelf({
          runtime,
          senderAddress: actor.senderAddress,
          typeId,
          quantity,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleClaimReceipts(typeId: number) {
    const actor = resolveActorExecution("owner");
    const quantity = readInventoryActionQuantity("claim", typeId);
    const item = resolvedSnapshot.ownerReserveInventory.find((entry) => entry.typeId === typeId);
    if (!isProcurementMode) {
      setBlockedAction("Claim receipts", "Claiming only applies in procurement mode.");
      return;
    }
    if (!runtime || !runtime.ownerCharacterId || !actor) {
      setBlockedAction(
        "Claim receipts",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load a live Barter Box before claiming receipts.",
      );
      return;
    }
    if (!item) {
      setBlockedAction("Claim receipts", "No claimable receipts are available for this item.");
      return;
    }
    if (quantity <= 0) {
      setBlockedAction("Claim receipts", "Claim quantity must be greater than zero.");
      return;
    }
    if (quantity > item.quantity) {
      setBlockedAction("Claim receipts", "Claim quantity exceeds the receipts currently available.");
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer" ? "Claim receipts (local demo signer)" : "Claim receipts",
      () =>
        claimReceipts({
          runtime,
          senderAddress: actor.senderAddress,
          typeId,
          quantity,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  async function handleRestockFromClaimable(typeId: number) {
    const actor = resolveActorExecution("owner");
    const quantity = readInventoryActionQuantity("restock", typeId);
    const item = resolvedSnapshot.ownerReserveInventory.find((entry) => entry.typeId === typeId);
    if (!isProcurementMode) {
      setBlockedAction("Restock from claimable", "Restocking from claimable receipts only applies in procurement mode.");
      return;
    }
    if (!runtime || !runtime.ownerCharacterId || !actor) {
      setBlockedAction(
        "Restock from claimable",
        showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load a live Barter Box before restocking receipts.",
      );
      return;
    }
    if (!item) {
      setBlockedAction("Restock from claimable", "No claimable receipts are available for this item.");
      return;
    }
    if (quantity <= 0) {
      setBlockedAction("Restock from claimable", "Restock quantity must be greater than zero.");
      return;
    }
    if (quantity > item.quantity) {
      setBlockedAction("Restock from claimable", "Restock quantity exceeds the receipts currently available.");
      return;
    }

    await runWalletAction(
      actor.mode === "local-demo-signer"
        ? "Restock from claimable (local demo signer)"
        : "Restock from claimable",
      () =>
        restockFromClaimable({
          runtime,
          senderAddress: actor.senderAddress,
          typeId,
          quantity,
          signAndExecuteTransaction: actor.executor,
        }),
      actor.mode === "local-demo-signer"
        ? "Signing locally in the browser with the configured owner demo key..."
        : "Awaiting wallet confirmation...",
    );
  }

  const shellClass = `app-shell mode-${viewMode}`;

  if (!snapshot || !requestedItem || !offeredItem || !preview || !ownerPolicyForm || !sharedNetworkPolicyForm) {
    return (
      <main className={shellClass}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{PRODUCT_WORKING_NAME}</p>
            <h1>Loading assembly context...</h1>
            <p className="hero-text">
              {isResolvingData ? "Resolving live locker state..." : "Unable to resolve the Barter Box view model."}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const resolvedSnapshot = snapshot;
  const resolvedPreview = preview;
  const resolvedOwnerPolicyForm = ownerPolicyForm;
  const resolvedSharedNetworkPolicyForm = sharedNetworkPolicyForm;
  const isProcurementMode =
    resolvedOwnerPolicyForm?.marketMode === "procurement" ||
    resolvedSnapshot.policy.marketMode === "procurement";

  const trustLabel = resolvedSnapshot.trustStatus === "frozen" ? "Frozen ruleset" : "Mutable ruleset";
  const ownerDraft = buildDraftFromForm(resolvedOwnerPolicyForm);
  const displayedCooldownEndLabel = formatCooldownCountdown(
    resolvedSnapshot.visitor.localCooldownEndTimestampMs,
    nowMs,
  );
  const displayedSharedLockoutLabel = formatCooldownCountdown(
    resolvedSnapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs,
    nowMs,
    "No network lockout",
    "Network lockout expired",
  );
  const displayedCooldownActive = Boolean(
    resolvedSnapshot.visitor.localCooldownEndTimestampMs &&
      resolvedSnapshot.visitor.localCooldownEndTimestampMs > nowMs,
  );
  const displayedSharedLockoutActive = Boolean(
    resolvedSnapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs &&
      resolvedSnapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs > nowMs,
  );
  const displayedAssemblyName = assembly?.name || resolvedSnapshot.lockerName;
  const displayedAssemblyId = assembly?.id || resolvedSnapshot.lockerId;
  const runtimeLabel =
    runtimeEnvironment === "localnet"
      ? "Localnet"
      : runtimeEnvironment === "utopia-in-game"
        ? "Utopia in-game"
        : "Utopia browser";
  const operatorStateLabel = resolvedSnapshot.policy.isActive ? "Online" : "Offline";
  const sameItemSelected = requestedItem.typeId === offeredItem.typeId;
  const compactTradeCopy = sameItemSelected
    ? "Select two different goods. Same-item trades are disabled in v1."
    : resolvedPreview.willStrike
      ? "Underpaying will add a strike and lock this locker temporarily."
      : resolvedSnapshot.policy.marketMode === "procurement"
        ? "Accepted goods become claimable by the owner when the trade clears."
        : "Published terms are satisfied for this exchange.";
  const networkPenaltyCopy =
    resolvedSnapshot.sharedPenalty.pricingPenaltyBps > 0
      ? `Network penalty active: +${(resolvedSnapshot.sharedPenalty.pricingPenaltyBps / 100).toFixed(0)}%`
      : "No network penalty";
  const marketModeSummary = marketModeLabel(resolvedSnapshot.policy.marketMode);
  const marketModeDescription = marketModeCopy(resolvedSnapshot.policy.marketMode);
  const fuelFeeCopy =
    resolvedSnapshot.policy.fuelFeeUnits > 0
      ? resolvedSnapshot.fuelFeeSupported
        ? `Trade fee: ${resolvedSnapshot.policy.fuelFeeUnits} Fuel`
        : `Fuel fee configured: ${resolvedSnapshot.policy.fuelFeeUnits} Fuel (deferred)`
      : "No Fuel fee";
  const runtimeUnavailableReason =
    runtimeEnvironment === "localnet"
      ? "Localnet runtime context is not loaded yet."
      : lockerData?.notes.find(
          (note) =>
            note.includes("Hosted Utopia") ||
            note.includes("connected wallet") ||
            note.includes("config is incomplete"),
        ) ?? "Live Utopia Barter Box state is not available yet.";
  const tradeBlockedReason = displayedCooldownActive
    ? `Trading locked while cooldown is active. ${displayedCooldownEndLabel}.`
    : displayedSharedLockoutActive
      ? `Blacklisted by strike network ${resolvedSnapshot.sharedPenalty.policy.scopeId}. ${displayedSharedLockoutLabel}.`
      : sameItemSelected
        ? "Choose two different goods. Same-item trades are disabled."
      : resolvedPreview.fuelFeeBlockedReason
        ? resolvedPreview.fuelFeeBlockedReason
      : !runtime
        ? runtimeUnavailableReason
        : resolvedSnapshot.openInventory.length === 0
          ? "The locker has no open inventory available for trade."
          : !runtime.visitorCharacterId
            ? "Connect a wallet with a live character to load your cargo and trade against this box."
            : !visitorActor
              ? showLocalDemoSignerPanel
                ? "Configure the local visitor demo signer or connect a visitor-capable wallet."
                : "Connect a visitor-capable wallet before trading."
            : null;
  const tradeButtonLabel = displayedCooldownActive
    ? "Cooldown active"
    : sameItemSelected
      ? "Choose different goods"
      : "Execute trade";
  const compactActionStatus = actionState.status !== "idle";
  const inContextStatusLabel =
    actionState.status === "success" ? "Transaction complete" : actionState.label;
  const currentViewDefinition: Record<UiMode, ViewDefinition> = {
    visitor: {
      label: "Visitor",
      eyebrow: "Visitor view",
      title: displayedAssemblyName,
      description: "Inspect what the box offers, compare it against your cargo, then trade against the published rules.",
    },
    owner: {
      label: "Owner",
      eyebrow: "Owner view",
      title: displayedAssemblyName,
      description: "Set what the box accepts in exchange, review the shelf, tune the market rules, and publish without using the debug surface.",
    },
    full: {
      label: "Full",
      eyebrow: "Full view",
      title: "Follow the box from identity to trade to governance.",
      description: "This walkthrough keeps the complete submission, audit, and operator context in one ordered page.",
    },
  };

  function renderModeToggle() {
    return (
      <div className="mode-switch" role="tablist" aria-label="View mode">
        {VIEW_SEQUENCE.map((mode) => (
          <button
            key={mode}
            type="button"
            className={mode === viewMode ? "mode-chip active" : "mode-chip"}
            onClick={() => setViewMode(mode)}
          >
            {currentViewDefinition[mode].label}
          </button>
        ))}
      </div>
    );
  }

  const currentPublishedPolicy = {
    ...resolvedSnapshot.policy,
    isFrozen: false,
  };
  const currentSharedPolicy = {
    scopeId: resolvedSnapshot.policy.strikeScopeId,
    pricingPenaltyPerStrikeBps: resolvedSnapshot.sharedPenalty.policy.pricingPenaltyPerStrikeBps,
    maxPricingPenaltyBps: resolvedSnapshot.sharedPenalty.policy.maxPricingPenaltyBps,
    lockoutStrikeThreshold: resolvedSnapshot.sharedPenalty.policy.lockoutStrikeThreshold,
    networkLockoutDurationMs: resolvedSnapshot.sharedPenalty.policy.networkLockoutDurationMs,
    isActive: resolvedSnapshot.sharedPenalty.policy.isActive,
  };
  const hasPendingPolicyChanges = JSON.stringify(ownerDraft) !== JSON.stringify(currentPublishedPolicy);
  const hasPendingNetworkChanges =
    JSON.stringify(resolvedSharedNetworkPolicyForm) !== JSON.stringify(currentSharedPolicy);

  function renderActionSummary(compact = false) {
    if (actionState.status === "idle" && compact) return null;
    return (
      <div className={compact ? "status-block compact" : "status-block"}>
        <p className={`action-status ${actionState.status}`}>
          {compact ? inContextStatusLabel : actionState.label}
        </p>
        <p className="status-copy">{actionState.message ?? "No wallet action has been attempted yet."}</p>
        {actionState.digest ? <p className="status-copy">Digest: {actionState.digest}</p> : null}
      </div>
    );
  }

  function renderWorkspaceTabs<T extends string>(
    tabs: WorkspaceTabDefinition<T>[],
    activeTab: T,
    setActiveTab: (tab: T) => void,
  ) {
    return (
      <div className="workspace-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? "workspace-tab active" : "workspace-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  function renderMetricTile(label: string, value: ReactNode, tone: "default" | "warning" | "accent" = "default") {
    return (
      <div className={`metric-tile ${tone}`}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    );
  }

  function renderAssetRows(
    items: LockerDataEnvelope["snapshot"]["openInventory"],
    quantityLabel: "shelf" | "hold" | "reserve",
    selectedTypeId?: number,
    disabledTypeId?: number,
    onSelect?: (typeId: number) => void,
  ) {
    if (items.length === 0) {
      return <p className="empty-state">No items available.</p>;
    }

    return items.map((item) => {
      const active = selectedTypeId === item.typeId;
      const disabled = disabledTypeId === item.typeId;
      const content = (
        <>
          <div className="asset-row-main">
            <div className="asset-copy">
              <strong>{item.label}</strong>
              <small>qty {item.quantity}</small>
            </div>
          </div>
          <div className="asset-row-meta">
            <span>{item.points} pts</span>
            <span>{formatVolume(item.volumeM3, item.quantity)}</span>
          </div>
        </>
      );

      if (!onSelect) {
        return (
          <div key={item.typeId} className="asset-row static">
            {content}
          </div>
        );
      }

      return (
        <button
          key={item.typeId}
          type="button"
          className={active ? "asset-row active" : disabled ? "asset-row disabled" : "asset-row"}
          disabled={disabled}
          onClick={() => onSelect(item.typeId)}
        >
          {content}
        </button>
      );
    });
  }

  function renderRailSection(props: {
    title: string;
    subtitle: string;
    items: LockerDataEnvelope["snapshot"]["openInventory"];
    quantityLabel: "shelf" | "hold" | "reserve";
    selectedTypeId?: number;
    disabledTypeId?: number;
    onSelect?: (typeId: number) => void;
  }) {
    return (
      <section className="rail-section">
        <div className="rail-section-header">
          <p className="section-label">{props.title}</p>
          <p className="section-copy">{props.subtitle}</p>
        </div>
        <div className="rail-scroll">
          {renderAssetRows(
            props.items,
            props.quantityLabel,
            props.selectedTypeId,
            props.disabledTypeId,
            props.onSelect,
          )}
        </div>
      </section>
    );
  }

  function renderVisitorTradeWorkspace(showExtendedMetrics: boolean) {
    return (
      <div className="workspace-stack">
        <div className="selection-grid">
          <section className="workspace-card">
            <div className="workspace-card-header">
              <p className="section-label">Request</p>
              <p className="section-copy">Selected from what the box currently offers.</p>
            </div>
            <div className="selection-summary">
              <strong>{resolvedPreview.requestedItem.label}</strong>
              <span>
                qty {requestedShelfEntry?.quantity ?? 0} | {resolvedPreview.requestedItem.points} pts |{" "}
                {formatVolume(resolvedPreview.requestedItem.volumeM3, 1)}
              </span>
            </div>
            <label className="field-block">
              <span>Quantity</span>
              <input
                type="number"
                min={1}
                value={requestedQuantity}
                onChange={(event) =>
                  startTransition(() => setRequestedQuantity(Math.max(1, Number(event.target.value) || 1)))
                }
              />
            </label>
          </section>

          <section className="workspace-card">
            <div className="workspace-card-header">
              <p className="section-label">Offer</p>
              <p className="section-copy">Selected from your current cargo.</p>
            </div>
            <div className="selection-summary">
              <strong>{resolvedPreview.offeredItem.label}</strong>
              <span>
                qty {offeredHoldEntry?.quantity ?? 0} | {resolvedPreview.offeredItem.points} pts |{" "}
                {formatVolume(resolvedPreview.offeredItem.volumeM3, 1)}
              </span>
            </div>
            <label className="field-block">
              <span>Quantity</span>
              <input
                type="number"
                min={0}
                value={offeredQuantity}
                onChange={(event) =>
                  startTransition(() => setOfferedQuantity(Math.max(0, Number(event.target.value) || 0)))
                }
              />
            </label>
          </section>
        </div>

        <div className="metrics-grid">
          {renderMetricTile("Request points", resolvedPreview.effectiveRequestedPoints, "accent")}
          {renderMetricTile("Offer points", resolvedPreview.offeredPoints)}
          {renderMetricTile(
            "Deficit",
            resolvedPreview.deficitPoints,
            resolvedPreview.deficitPoints > 0 ? "warning" : "default",
          )}
          {renderMetricTile(
            "Request volume",
            formatVolume(resolvedPreview.requestedItem.volumeM3, resolvedPreview.requestedQuantity),
          )}
          {renderMetricTile(
            "Offer volume",
            formatVolume(resolvedPreview.offeredItem.volumeM3, resolvedPreview.offeredQuantity),
          )}
          {renderMetricTile(
            "Fuel fee",
            resolvedPreview.fuelFeeUnits > 0 ? `${resolvedPreview.fuelFeeUnits} Fuel` : "0",
          )}
          {showExtendedMetrics
            ? renderMetricTile("Base request", resolvedPreview.baseRequestedPoints)
            : null}
          {showExtendedMetrics
            ? renderMetricTile(
                "Bucket multiplier",
                `${(resolvedPreview.pricingMultiplierBps / 100).toFixed(2)}%`,
              )
            : null}
          {showExtendedMetrics
            ? renderMetricTile(
                "Network penalty",
                `${(resolvedPreview.sharedPricingPenaltyBps / 100).toFixed(2)}%`,
              )
            : null}
        </div>

        <section className={resolvedPreview.willStrike ? "callout warning" : "callout"}>
          <p className="section-label">
            {resolvedPreview.willStrike ? "Strike warning" : "Trade state"}
          </p>
          <p className="section-copy">{compactTradeCopy}</p>
        </section>
      </div>
    );
  }

  function renderTermsWorkspace(options?: { compact?: boolean; advanced?: boolean }) {
    const compact = options?.compact ?? false;
    const advanced = options?.advanced ?? false;
    return (
      <div className="workspace-stack">
        <div className="metrics-grid">
          {renderMetricTile("Market mode", marketModeSummary, "accent")}
          {renderMetricTile("Cooldown", `${resolvedSnapshot.policy.cooldownMs / 1000}s`)}
          {advanced
            ? renderMetricTile("Friendly", formatMultiplierValue(resolvedSnapshot.policy.friendlyMultiplierBps))
            : renderMetricTile("Your standing", resolvedSnapshot.visitor.relationshipBucket, "accent")}
          {advanced
            ? renderMetricTile("Rival", formatMultiplierValue(resolvedSnapshot.policy.rivalMultiplierBps))
            : renderMetricTile("Your multiplier", formatMultiplierValue(resolvedPreview.pricingMultiplierBps))}
          {advanced
            ? renderMetricTile("Friendly IDs", resolvedSnapshot.policy.friendlyTribes.join(", ") || "none")
            : renderMetricTile("Accepted in exchange", resolvedSnapshot.policy.acceptedItems.length)}
          {advanced
            ? renderMetricTile("Rival IDs", resolvedSnapshot.policy.rivalTribes.join(", ") || "none")
            : renderMetricTile("Fuel fee", resolvedSnapshot.policy.fuelFeeUnits || "off")}
          {renderMetricTile(
            "Shared network",
            resolvedSnapshot.policy.useSharedPenalties
              ? `scope ${resolvedSnapshot.policy.strikeScopeId}`
              : "isolated",
          )}
          {advanced ? renderMetricTile("Fuel fee", resolvedSnapshot.policy.fuelFeeUnits || "off") : null}
        </div>
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">{advanced ? "Accepted goods" : "Accepted in exchange"}</p>
            <p className="section-copy">
              {advanced
                ? "These are the goods the box can price and accept during a trade."
                : "Only these goods can be used as payment. What visitors can take depends on what is stocked on the shelf."}
            </p>
          </div>
          <div className="accepted-goods-list">
            {resolvedSnapshot.policy.acceptedItems.map((item) => (
              <div key={item.typeId} className="accepted-goods-row">
                <strong>{item.label}</strong>
                <span>{item.points} pts</span>
                <span>{formatVolume(item.volumeM3, 1)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="callout">
          <p className="section-label">Mode behavior</p>
          <p className="section-copy">
            {compact
              ? marketModeDescription
              : advanced
                ? `${marketModeDescription} ${fuelFeeCopy}.`
                : `${marketModeDescription} Only listed goods can be offered in exchange.`}
          </p>
        </section>
      </div>
    );
  }

  function renderStatusWorkspace() {
    return (
      <div className="workspace-stack">
        <div className="metrics-grid">
          {renderMetricTile("Bucket", resolvedSnapshot.visitor.relationshipBucket, "accent")}
          {renderMetricTile("Local strikes", resolvedSnapshot.visitor.localStrikeCount)}
          {renderMetricTile(
            "Local cooldown",
            displayedCooldownActive ? displayedCooldownEndLabel : "clear",
            displayedCooldownActive ? "warning" : "default",
          )}
          {renderMetricTile("Shared strikes", resolvedSnapshot.sharedPenalty.penalties.strikeCount)}
          {renderMetricTile(
            "Network lock",
            displayedSharedLockoutActive ? displayedSharedLockoutLabel : "clear",
            displayedSharedLockoutActive ? "warning" : "default",
          )}
          {renderMetricTile("Penalty", networkPenaltyCopy)}
        </div>
        {renderActionSummary(false)}
      </div>
    );
  }

  function renderOwnerGoodsWorkspace() {
    return (
      <div className="workspace-stack">
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">Offered on shelf</p>
            <p className="section-copy">
              This is what visitors can currently take. Shelf stock is real inventory, not policy. Use the Inventory tab to load more goods into the box.
            </p>
          </div>
          <div className="accepted-goods-list">
            {resolvedSnapshot.openInventory.length === 0 ? (
              <p className="empty-state">No shelf stock is available yet.</p>
            ) : (
              resolvedSnapshot.openInventory.map((item) => (
                <div key={item.typeId} className="accepted-goods-row">
                  <strong>{item.label}</strong>
                  <span>qty {item.quantity}</span>
                  <span>{formatVolume(item.volumeM3, item.quantity)}</span>
                </div>
              ))
            )}
          </div>
        </section>
        {resolvedSnapshot.policy.marketMode === "procurement" ? (
          <section className="workspace-card">
            <div className="workspace-card-header">
              <p className="section-label">Claimable by owner</p>
              <p className="section-copy">
                In procurement mode, visitor payments land here for the owner to collect later.
              </p>
            </div>
            <div className="accepted-goods-list">
              {resolvedSnapshot.ownerReserveInventory.length === 0 ? (
                <p className="empty-state">No claimable receipts are available yet.</p>
              ) : (
                resolvedSnapshot.ownerReserveInventory.map((item) => (
                  <div key={item.typeId} className="accepted-goods-row">
                    <strong>{item.label}</strong>
                    <span>qty {item.quantity}</span>
                    <span>{formatVolume(item.volumeM3, item.quantity)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="callout">
            <p className="section-label">Perpetual circulation</p>
            <p className="section-copy">
              In perpetual mode, visitor payments return to the public shelf. Claimable receipts only appear in procurement mode.
            </p>
          </section>
        )}
        <section className="workspace-card grow">
          <div className="workspace-card-header">
            <p className="section-label">Accepted in exchange</p>
            <p className="section-copy">
              Enable the goods this box will accept as payment and assign the point value for each one.
            </p>
          </div>
          <div className="catalog-editor">
            {TRUST_LOCKER_CATALOG.map((item) => {
              const enabled = resolvedOwnerPolicyForm.enabledTypeIds.includes(item.typeId);
              return (
                <label key={item.typeId} className={enabled ? "catalog-row enabled" : "catalog-row"}>
                  <span className="catalog-main">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) =>
                        setOwnerPolicyForm((current) => {
                          if (!current) return current;
                          const nextEnabled = event.target.checked
                            ? [...current.enabledTypeIds, item.typeId]
                            : current.enabledTypeIds.filter((typeId) => typeId !== item.typeId);
                          return {
                            ...current,
                            enabledTypeIds: Array.from(new Set(nextEnabled)),
                          };
                        })
                      }
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{formatVolume(item.volumeM3, 1)} | {item.points} pts</small>
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    disabled={!enabled}
                    value={resolvedOwnerPolicyForm.pointsByTypeId[item.typeId] ?? item.points}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              pointsByTypeId: {
                                ...current.pointsByTypeId,
                                [item.typeId]: Math.max(1, Number(event.target.value) || 1),
                              },
                            }
                          : current,
                      )
                    }
                  />
                </label>
              );
            })}
          </div>
        </section>
        <div className="metrics-grid">
          {renderMetricTile("Shelf lines", resolvedSnapshot.openInventory.length)}
          {resolvedSnapshot.policy.marketMode === "procurement"
            ? renderMetricTile("Claimable by owner", resolvedSnapshot.ownerReserveInventory.length)
            : renderMetricTile("Shelf returns", "public circulation")}
          {renderMetricTile("Cargo lines", resolvedSnapshot.ownerCargoInventory.length)}
          {renderMetricTile("Risk posture", buildRiskLabel(ownerDraft), "accent")}
        </div>
      </div>
    );
  }

  function renderInventoryActionRows(props: {
    title: string;
    subtitle: string;
    items: LockerDataEnvelope["snapshot"]["openInventory"];
    emptyState: string;
    quantityLabel: string;
    actions: Array<{
      kind: InventoryActionKind;
      label: string;
      onClick: (typeId: number) => Promise<void>;
    }>;
  }) {
    return (
      <section className="workspace-card">
        <div className="workspace-card-header">
          <p className="section-label">{props.title}</p>
          <p className="section-copy">{props.subtitle}</p>
        </div>
        <div className="inventory-mutation-list">
          {props.items.length === 0 ? (
            <p className="empty-state">{props.emptyState}</p>
          ) : (
            props.items.map((item) => (
              <div key={item.typeId} className="inventory-mutation-row">
                <div className="inventory-mutation-copy">
                  <strong>{item.label}</strong>
                  <span>{props.quantityLabel} qty {item.quantity}</span>
                  <span>{item.points} pts | {formatVolume(item.volumeM3, item.quantity)}</span>
                </div>
                <div className="inventory-mutation-controls">
                  {props.actions.map((action) => (
                    <label key={action.kind} className="inventory-action-control">
                      <span>{action.label}</span>
                      <div className="inventory-action-inline">
                        <input
                          type="number"
                          min={0}
                          value={readInventoryActionQuantity(action.kind, item.typeId)}
                          onChange={(event) =>
                            updateInventoryActionQuantity(action.kind, item.typeId, event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className={action.kind === "claim" ? "secondary-action" : "primary-action"}
                          disabled={actionState.status === "pending"}
                          onClick={() => void action.onClick(item.typeId)}
                        >
                          {action.label}
                        </button>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderOwnerInventoryWorkspace() {
    return (
      <div className="workspace-stack">
        <section className="callout">
          <p className="section-label">Inventory flow</p>
          <p className="section-copy">
            Shelf stock is what visitors can take. Items you are offering for trade come from your personal inventory slot inside this box. Procurement receipts become claimable by owner until you claim them or restock them.
          </p>
        </section>
        {renderInventoryActionRows({
          title: "Items you are offering for trade",
          subtitle: "Use this inventory slot as the source when you stock the shelf.",
          items: resolvedSnapshot.ownerCargoInventory,
          emptyState: "No owner cargo is currently loaded into this box.",
          quantityLabel: "cargo",
          actions: [
            {
              kind: "stock",
              label: "Stock",
              onClick: handleStockShelf,
            },
          ],
        })}
        {resolvedSnapshot.policy.marketMode === "procurement"
          ? renderInventoryActionRows({
              title: "Claimable by owner",
              subtitle: "Procurement receipts accumulate here until you claim them or restock them onto the shelf.",
              items: resolvedSnapshot.ownerReserveInventory,
              emptyState: "No claimable receipts are available yet.",
              quantityLabel: "claimable",
              actions: [
                {
                  kind: "claim",
                  label: "Claim",
                  onClick: handleClaimReceipts,
                },
                {
                  kind: "restock",
                  label: "Restock",
                  onClick: handleRestockFromClaimable,
                },
              ],
            })
          : (
            <section className="callout">
              <p className="section-label">Perpetual circulation</p>
              <p className="section-copy">
                Perpetual mode sends visitor payments back onto the public shelf. There are no separate claimable receipts in this mode.
              </p>
            </section>
          )}
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">Offered on shelf</p>
            <p className="section-copy">This is the current public stock visitors can take right now.</p>
          </div>
          <div className="accepted-goods-list">
            {resolvedSnapshot.openInventory.length === 0 ? (
              <p className="empty-state">No shelf stock is available yet.</p>
            ) : (
              resolvedSnapshot.openInventory.map((item) => (
                <div key={item.typeId} className="accepted-goods-row">
                  <strong>{item.label}</strong>
                  <span>qty {item.quantity}</span>
                  <span>{formatVolume(item.volumeM3, item.quantity)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderOwnerTermsWorkspace() {
    const advanced = isFullMode;
    return (
      <div className="workspace-stack">
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">Market settings</p>
            <p className="section-copy">
              {advanced
                ? "Advanced relationship pricing and internal identifiers stay in Full view."
                : "Set the market behavior and visitor cooldown. Advanced identifiers and internal pricing controls stay in Full view."}
            </p>
          </div>
          <div className="field-grid">
            {advanced ? (
              <>
                <label className="field-block">
                  <span>Friendly tribe IDs</span>
                  <input
                    value={resolvedOwnerPolicyForm.friendlyTribesText}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current ? { ...current, friendlyTribesText: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Rival tribe IDs</span>
                  <input
                    value={resolvedOwnerPolicyForm.rivalTribesText}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current ? { ...current, rivalTribesText: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Friendly multiplier</span>
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={Number((resolvedOwnerPolicyForm.friendlyMultiplierBps / 10000).toFixed(2))}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current
                          ? { ...current, friendlyMultiplierBps: parseMultiplierInput(event.target.value) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Rival multiplier</span>
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={Number((resolvedOwnerPolicyForm.rivalMultiplierBps / 10000).toFixed(2))}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current
                          ? { ...current, rivalMultiplierBps: parseMultiplierInput(event.target.value) }
                          : current,
                      )
                    }
                  />
                </label>
              </>
            ) : null}
            <label className="field-block">
              <span>Market mode</span>
              <select
                value={resolvedOwnerPolicyForm.marketMode}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current
                      ? {
                          ...current,
                          marketMode: event.target.value === "procurement" ? "procurement" : "perpetual",
                        }
                      : current,
                  )
                }
              >
                <option value="perpetual">Perpetual Market</option>
                <option value="procurement">Procurement Market</option>
              </select>
            </label>
            <label className="field-block">
              <span>{advanced ? "Cooldown (ms)" : "Cooldown (seconds)"}</span>
              <input
                type="number"
                min={0}
                value={advanced ? resolvedOwnerPolicyForm.cooldownMs : resolvedOwnerPolicyForm.cooldownMs / 1000}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current
                      ? {
                          ...current,
                          cooldownMs: Math.max(
                            0,
                            Math.round((Number(event.target.value) || 0) * (advanced ? 1 : 1000)),
                          ),
                        }
                      : current,
                  )
                }
              />
            </label>
            {advanced ? (
              <>
                <label className="field-block">
                  <span>Trade fee (Fuel)</span>
                  <input
                    type="number"
                    min={0}
                    disabled
                    value={resolvedOwnerPolicyForm.fuelFeeUnits}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current
                          ? { ...current, fuelFeeUnits: Math.max(0, Number(event.target.value) || 0) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block checkbox-field">
                  <span>Policy active</span>
                  <input
                    type="checkbox"
                    checked={resolvedOwnerPolicyForm.isActive}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current,
                      )
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>
        {advanced ? (
          <section className="callout">
            <p className="section-label">Deferred Fuel fee</p>
            <p className="section-copy">
              Fuel fees remain disabled until the world contracts prove a real visitor-side Fuel debit path.
            </p>
          </section>
        ) : (
          <div className="metrics-grid">
            {renderMetricTile("Mode", marketModeSummary, "accent")}
            {renderMetricTile("Cooldown", `${resolvedOwnerPolicyForm.cooldownMs / 1000}s`)}
            {renderMetricTile("Policy", resolvedOwnerPolicyForm.isActive ? "online" : "offline")}
          </div>
        )}
      </div>
    );
  }

  function renderOwnerNetworkWorkspace() {
    const advanced = isFullMode;
    return (
      <div className="workspace-stack">
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">Trust network</p>
            <p className="section-copy">
              {advanced
                ? "Shared penalties remain optional and owner-defined."
                : "Shared penalties are optional. Raw trust-network tuning stays in Full view."}
            </p>
          </div>
          <div className="field-grid">
            <label className="field-block checkbox-field">
              <span>Use shared penalties</span>
              <input
                type="checkbox"
                checked={resolvedOwnerPolicyForm.useSharedPenalties}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current ? { ...current, useSharedPenalties: event.target.checked } : current,
                  )
                }
              />
            </label>
            {advanced ? (
              <>
                <label className="field-block">
                  <span>Strike scope ID</span>
                  <input
                    type="number"
                    min={0}
                    value={resolvedOwnerPolicyForm.strikeScopeId}
                    onChange={(event) =>
                      setOwnerPolicyForm((current) =>
                        current
                          ? { ...current, strikeScopeId: Math.max(0, Number(event.target.value) || 0) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Penalty / strike (bps)</span>
                  <input
                    type="number"
                    min={0}
                    value={resolvedSharedNetworkPolicyForm.pricingPenaltyPerStrikeBps}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              pricingPenaltyPerStrikeBps: Math.max(0, Number(event.target.value) || 0),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Max penalty (bps)</span>
                  <input
                    type="number"
                    min={0}
                    value={resolvedSharedNetworkPolicyForm.maxPricingPenaltyBps}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? { ...current, maxPricingPenaltyBps: Math.max(0, Number(event.target.value) || 0) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Lockout threshold</span>
                  <input
                    type="number"
                    min={1}
                    value={resolvedSharedNetworkPolicyForm.lockoutStrikeThreshold}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? { ...current, lockoutStrikeThreshold: Math.max(1, Number(event.target.value) || 1) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block">
                  <span>Lockout duration (ms)</span>
                  <input
                    type="number"
                    min={0}
                    value={resolvedSharedNetworkPolicyForm.networkLockoutDurationMs}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              networkLockoutDurationMs: Math.max(0, Number(event.target.value) || 0),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="field-block checkbox-field">
                  <span>Shared network active</span>
                  <input
                    type="checkbox"
                    checked={resolvedSharedNetworkPolicyForm.isActive}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current,
                      )
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>
        <div className="metrics-grid">
          {renderMetricTile("Scope", ownerDraft.useSharedPenalties ? ownerDraft.strikeScopeId : "isolated")}
          {renderMetricTile("Penalty", `${(resolvedSharedNetworkPolicyForm.pricingPenaltyPerStrikeBps / 100).toFixed(2)}%`)}
          {renderMetricTile("Threshold", resolvedSharedNetworkPolicyForm.lockoutStrikeThreshold)}
          {renderMetricTile("Lockout", `${Math.round(resolvedSharedNetworkPolicyForm.networkLockoutDurationMs / 1000)}s`)}
        </div>
      </div>
    );
  }

  function renderOwnerPublishWorkspace() {
    return (
      <div className="workspace-stack">
        <div className="metrics-grid">
          {renderMetricTile("Trust status", trustLabel, resolvedSnapshot.trustStatus === "frozen" ? "warning" : "accent")}
          {renderMetricTile("Policy status", resolvedSnapshot.policy.isActive ? "active" : "inactive")}
          {renderMetricTile("Pending policy changes", hasPendingPolicyChanges ? "yes" : "no")}
          {renderMetricTile("Pending network changes", hasPendingNetworkChanges ? "yes" : "no")}
        </div>
        <section className="callout warning">
          <p className="section-label">Freeze is irreversible</p>
          <p className="section-copy">
            Save the ruleset first. Freeze only when the box terms are final.
          </p>
        </section>
        {renderActionSummary(false)}
      </div>
    );
  }

  function renderOverviewWorkspace() {
    return (
      <div className="workspace-stack">
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">How to read this box</p>
            <p className="section-copy">
              Inspect the unit, read the published terms, then either trade as a visitor or configure as the owner.
            </p>
          </div>
          <div className="metrics-grid">
            {renderMetricTile("Assembly", displayedAssemblyName, "accent")}
            {renderMetricTile("Owner", resolvedSnapshot.owner.label)}
            {renderMetricTile("Runtime", runtimeLabel)}
            {renderMetricTile("State", operatorStateLabel)}
            {renderMetricTile("Trust", trustLabel)}
            {renderMetricTile("Market mode", marketModeSummary)}
            {renderMetricTile("Risk posture", buildRiskLabel(resolvedSnapshot.policy))}
            {renderMetricTile("Fuel fee", fuelFeeCopy)}
          </div>
        </section>
        {renderTermsWorkspace({ compact: true, advanced: true })}
      </div>
    );
  }

  function renderSignalsWorkspace() {
    return (
      <div className="workspace-stack">
        <section className="workspace-card grow">
          <div className="workspace-card-header">
            <p className="section-label">Recent signals</p>
            <p className="section-copy">Event and action traces live here instead of the main interaction tabs.</p>
          </div>
          <ul className="signal-list">
            {resolvedSnapshot.recentSignals.length === 0 ? (
              <li className="empty-state">No recent Barter Box events are available.</li>
            ) : (
              resolvedSnapshot.recentSignals.map((signal) => (
                <li key={`${signal.digest}-${signal.type}`}>
                  <strong>{signal.type}</strong>
                  <span>{signal.summary}</span>
                  <small>{signal.digest}</small>
                </li>
              ))
            )}
          </ul>
        </section>
        {renderActionSummary(false)}
      </div>
    );
  }

  function renderLocalSignerPanel() {
    if (!showLocalDemoSignerPanel) return null;
    return (
      <section className="workspace-card">
        <div className="workspace-card-header">
          <p className="section-label">Local Demo Signer</p>
          <p className="section-copy">Unsafe local-only signer path for localnet proof.</p>
        </div>
        <div className="field-grid">
          <label className="field-block">
            <span>Owner signer secret</span>
            <input
              type="password"
              placeholder="suiprivkey..."
              value={localDemoSignerDraft.ownerSecretKey}
              onChange={(event) =>
                setLocalDemoSignerDraft((current) => ({
                  ...current,
                  ownerSecretKey: event.target.value,
                }))
              }
            />
          </label>
          <label className="field-block">
            <span>Visitor signer secret</span>
            <input
              type="password"
              placeholder="suiprivkey..."
              value={localDemoSignerDraft.visitorSecretKey}
              onChange={(event) =>
                setLocalDemoSignerDraft((current) => ({
                  ...current,
                  visitorSecretKey: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="metrics-grid">
          {renderMetricTile(
            "Owner signer",
            ownerLocalSigner.address
              ? abbreviateAddress(ownerLocalSigner.address)
              : ownerLocalSigner.configured
                ? "Invalid secret"
                : "Not configured",
          )}
          {renderMetricTile(
            "Visitor signer",
            visitorLocalSigner.address
              ? abbreviateAddress(visitorLocalSigner.address)
              : visitorLocalSigner.configured
                ? "Invalid secret"
                : "Not configured",
          )}
        </div>
        <div className="button-row">
          <button className="primary-action" onClick={persistLocalDemoSignerDraft}>
            Save local signer secrets
          </button>
          <button className="secondary-action" onClick={clearLocalDemoSignerDraft}>
            Clear local signer secrets
          </button>
        </div>
        {localDemoSignerMessage ? <p className="section-copy">{localDemoSignerMessage}</p> : null}
      </section>
    );
  }

  function renderDiscoveryPanel() {
    if (!showDiscoveryPanel) return null;
    return (
      <section className="workspace-card">
        <div className="workspace-card-header">
          <p className="section-label">Utopia Object Discovery</p>
          <p className="section-copy">Use this only when the game UI does not expose an itemId.</p>
        </div>
        <div className="button-row">
          <button
            className="primary-action"
            disabled={!account || isLoadingOwnedObjects}
            onClick={() => void loadOwnedObjectsForConnectedWallet()}
          >
            {isLoadingOwnedObjects ? "Loading objects..." : "Load owned objects"}
          </button>
          <button
            className="secondary-action"
            disabled={isLoadingOwnedObjects}
            onClick={() => void loadPublicUtopiaObjects()}
          >
            {isLoadingOwnedObjects ? "Loading objects..." : "Load public Utopia objects"}
          </button>
        </div>
        <p className="section-copy">
          Connected wallet: {account?.address ?? "not connected"}.
        </p>
        {ownedObjectsMessage ? <p className="section-copy">{ownedObjectsMessage}</p> : null}
        <ul className="signal-list">
          {ownedObjectCandidates.length === 0 ? (
            <li className="empty-state">No candidate objects loaded yet.</li>
          ) : (
            ownedObjectCandidates.map((candidate) => {
              const candidateTenant = candidate.tenant || "utopia";
              const visitorUrl = buildAssemblyViewUrl(candidate.itemId, candidateTenant, "visitor");
              const ownerUrl = buildAssemblyViewUrl(candidate.itemId, candidateTenant, "owner");
              return (
                <li key={`${candidate.itemId}-${candidate.objectId ?? candidate.typeId}`}>
                  <strong>{candidate.name}</strong>
                  <span>itemId: {candidate.itemId}</span>
                  <span>tenant: {candidateTenant}</span>
                  <span>type_id: {candidate.typeId}</span>
                  <span>source: {candidate.source}</span>
                  <div className="button-row discovery-actions">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => openCandidateInView(candidate, "visitor")}
                    >
                      Open in Visitor
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => openCandidateInView(candidate, "owner")}
                    >
                      Open in Owner
                    </button>
                  </div>
                  <small>{visitorUrl}</small>
                  <small>{ownerUrl}</small>
                </li>
              );
            })
          )}
        </ul>
      </section>
    );
  }

  function renderProofWorkspace() {
    return (
      <div className="workspace-stack">
        <section className="workspace-card">
          <div className="workspace-card-header">
            <p className="section-label">Proof notes</p>
            <p className="section-copy">
              Localnet uses the explicit local-only demo signer path. Hosted Utopia uses a real wallet path only.
            </p>
          </div>
          {showSupportCopy ? (
            <div className="note-list">
              {loading ? <span>Reading selected smart object...</span> : null}
              {!loading && lockerData?.notes.map((note) => <span key={note}>{note}</span>)}
            </div>
          ) : null}
        </section>
        {renderLocalSignerPanel()}
        {renderDiscoveryPanel()}
        {renderActionSummary(false)}
      </div>
    );
  }

  function renderLeftRail() {
    if (isVisitorMode) {
      return (
        <aside className="shell-panel left-rail visitor-rail">
          {renderRailSection({
            title: "Available from box",
            subtitle: "Current shelf stock available to take.",
            items: resolvedSnapshot.openInventory,
            quantityLabel: "shelf",
            selectedTypeId: requestedTypeId,
            disabledTypeId: offeredTypeId,
            onSelect: (typeId) => startTransition(() => setRequestedTypeId(typeId)),
          })}
          {renderRailSection({
            title: "Your cargo",
            subtitle: "Goods you can offer in exchange.",
            items: resolvedSnapshot.visitorInventory,
            quantityLabel: "hold",
            selectedTypeId: offeredTypeId,
            disabledTypeId: requestedTypeId,
            onSelect: (typeId) => startTransition(() => setOfferedTypeId(typeId)),
          })}
        </aside>
      );
    }

    if (isOwnerMode) {
      if (ownerWorkspaceTab === "inventory") {
        return (
          <aside className={`shell-panel left-rail ${isProcurementMode ? "owner-rail" : "owner-rail-single"}`}>
            {renderRailSection({
              title: "Items you are offering for trade",
              subtitle: "Owner-held inventory inside this box, available for stocking.",
              items: resolvedSnapshot.ownerCargoInventory,
              quantityLabel: "hold",
            })}
            {isProcurementMode
              ? renderRailSection({
                  title: "Claimable by owner",
                  subtitle: "Procurement receipts waiting to be claimed or restocked.",
                  items: resolvedSnapshot.ownerReserveInventory,
                  quantityLabel: "reserve",
                })
              : null}
          </aside>
        );
      }

      return (
        <aside className={`shell-panel left-rail ${isProcurementMode ? "owner-rail" : "owner-rail-single"}`}>
          {renderRailSection({
            title: "Offered on shelf",
            subtitle: "Current stock already loaded into this box for visitors to take.",
            items: resolvedSnapshot.openInventory,
            quantityLabel: "shelf",
          })}
          {isProcurementMode
            ? renderRailSection({
                title: "Claimable by owner",
                subtitle:
                  "In procurement mode, goods visitors pay in land here for the owner to collect later.",
                items: resolvedSnapshot.ownerReserveInventory,
                quantityLabel: "reserve",
              })
            : null}
        </aside>
      );
    }

    const railTabs: WorkspaceTabDefinition<FullRailPanel>[] = [
      { id: "shelf", label: "Shelf" },
      { id: "hold", label: "Cargo" },
      { id: "reserve", label: "Reserve" },
    ];
    const activeItems =
      fullRailPanel === "shelf"
        ? resolvedSnapshot.openInventory
        : fullRailPanel === "hold"
          ? resolvedSnapshot.visitorInventory
          : resolvedSnapshot.ownerReserveInventory;
    const activeQuantityLabel =
      fullRailPanel === "shelf" ? "shelf" : fullRailPanel === "hold" ? "hold" : "reserve";
    const activeSelectedTypeId = fullRailPanel === "shelf" ? requestedTypeId : fullRailPanel === "hold" ? offeredTypeId : undefined;

    return (
      <aside className="shell-panel left-rail full-rail">
        <div className="rail-tabs">
          {railTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === fullRailPanel ? "rail-tab active" : "rail-tab"}
              onClick={() => setFullRailPanel(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rail-scroll rail-full-scroll">
          {renderAssetRows(
            activeItems,
            activeQuantityLabel,
            activeSelectedTypeId,
            fullRailPanel === "shelf"
              ? offeredTypeId
              : fullRailPanel === "hold"
                ? requestedTypeId
                : undefined,
            fullRailPanel === "shelf"
              ? (typeId) => startTransition(() => setRequestedTypeId(typeId))
              : fullRailPanel === "hold"
                ? (typeId) => startTransition(() => setOfferedTypeId(typeId))
                : undefined,
          )}
        </div>
      </aside>
    );
  }

  function renderVisitorWorkspace() {
    if (!showVisitorWorkspace) {
      return <section className="workspace-empty">Visitor controls are not available in this runtime.</section>;
    }

    switch (visitorWorkspaceTab) {
      case "terms":
        return renderTermsWorkspace();
      case "status":
        return renderStatusWorkspace();
      case "trade":
      default:
        return renderVisitorTradeWorkspace(false);
    }
  }

  function renderOwnerWorkspace() {
    if (!showOwnerWorkspace) {
      return <section className="workspace-empty">Owner controls are not available in this runtime.</section>;
    }

    switch (ownerWorkspaceTab) {
      case "inventory":
        return renderOwnerInventoryWorkspace();
      case "terms":
        return renderOwnerTermsWorkspace();
      case "network":
        return renderOwnerNetworkWorkspace();
      case "publish":
        return renderOwnerPublishWorkspace();
      case "goods":
      default:
        return renderOwnerGoodsWorkspace();
    }
  }

  function renderFullOwnerWorkspace() {
    return (
      <div className="workspace-stack">
        {renderOwnerGoodsWorkspace()}
        {renderOwnerInventoryWorkspace()}
        {renderOwnerTermsWorkspace()}
        {renderOwnerNetworkWorkspace()}
        {renderOwnerPublishWorkspace()}
      </div>
    );
  }

  function renderFullWorkspace() {
    switch (fullWorkspaceTab) {
      case "trade":
        return renderVisitorTradeWorkspace(true);
      case "owner":
        return renderFullOwnerWorkspace();
      case "signals":
        return renderSignalsWorkspace();
      case "proof":
        return renderProofWorkspace();
      case "overview":
      default:
        return renderOverviewWorkspace();
    }
  }

  function renderWorkspaceContent() {
    if (isVisitorMode) return renderVisitorWorkspace();
    if (isOwnerMode) return renderOwnerWorkspace();
    return renderFullWorkspace();
  }

  function renderActiveWorkspaceTabs() {
    if (isVisitorMode) {
      return renderWorkspaceTabs(VISITOR_WORKSPACE_TABS, visitorWorkspaceTab, setVisitorWorkspaceTab);
    }
    if (isOwnerMode) {
      return renderWorkspaceTabs(OWNER_WORKSPACE_TABS, ownerWorkspaceTab, setOwnerWorkspaceTab);
    }
    return renderWorkspaceTabs(FULL_WORKSPACE_TABS, fullWorkspaceTab, setFullWorkspaceTab);
  }

  const bottomMessage =
    actionState.status !== "idle"
      ? actionState.message ?? "Wallet action completed."
      : isVisitorMode || fullWorkspaceTab === "trade"
        ? tradeBlockedReason ?? compactTradeCopy
        : isOwnerMode && ownerWorkspaceTab === "inventory"
          ? !runtime
            ? runtimeUnavailableReason
            : isProcurementMode
              ? "Use Inventory to stock shelf goods, claim procurement receipts, or restock them onto the shelf."
              : "Use Inventory to move goods from your cargo here onto the public shelf."
          : isOwnerMode || fullWorkspaceTab === "owner"
          ? !runtime
            ? runtimeUnavailableReason
            : hasPendingPolicyChanges || hasPendingNetworkChanges
              ? "Draft changes are pending publication."
              : "Published rules match the current draft."
          : isFullMode && fullWorkspaceTab === "proof"
            ? "Proof and discovery tools stay isolated from the normal interaction surfaces."
            : currentViewDefinition[viewMode].description;

  const showTradeActions = isVisitorMode || (isFullMode && fullWorkspaceTab === "trade");
  const showOwnerActions =
    (isOwnerMode && ownerWorkspaceTab === "publish") || (isFullMode && fullWorkspaceTab === "owner");
  const idleStatusLabel = showTradeActions
    ? "Trade status"
    : showOwnerActions
      ? "Owner status"
      : "Status";

  function renderBottomBar() {
    return (
      <footer className="bottom-strip">
        <div className="bottom-status">
          <p className={`action-status ${actionState.status}`}>
            {actionState.status === "idle" ? idleStatusLabel : inContextStatusLabel}
          </p>
          <p className="status-copy">{bottomMessage}</p>
          {actionState.digest ? <p className="status-copy">Digest: {actionState.digest}</p> : null}
        </div>
        <div className="bottom-actions">
          {isFullMode && fullWorkspaceTab === "owner" && resolvedSnapshot.owner.canEditSharedPenaltyPolicy ? (
            <button
              className="secondary-action"
              disabled={
                actionState.status === "pending" ||
                !runtime ||
                !runtime.ownerCharacterId ||
                resolvedSnapshot.policy.isFrozen ||
                !ownerActor
              }
              onClick={() => void handleSharedNetworkPolicySave()}
            >
              Save network
            </button>
          ) : null}
          {showOwnerActions ? (
            <button
              className="primary-action"
              disabled={
                actionState.status === "pending" ||
                !runtime ||
                !runtime.ownerCharacterId ||
                resolvedSnapshot.policy.isFrozen ||
                !ownerActor
              }
              onClick={() => void handlePolicySave()}
            >
              Save policy
            </button>
          ) : null}
          {showOwnerActions ? (
            <button
              className="secondary-action"
              disabled={
                actionState.status === "pending" ||
                !runtime ||
                !runtime.ownerCharacterId ||
                resolvedSnapshot.policy.isFrozen ||
                !ownerActor
              }
              onClick={() => void handleFreeze()}
            >
              Freeze ruleset
            </button>
          ) : null}
          {showTradeActions ? (
            <button
              className="primary-action"
              disabled={actionState.status === "pending" || Boolean(tradeBlockedReason)}
              onClick={() => void handleTrade()}
            >
              {tradeButtonLabel}
            </button>
          ) : null}
          <button className="secondary-action" onClick={() => void refreshLockerContext()}>
            Refresh
          </button>
        </div>
      </footer>
    );
  }

  if (!snapshot || !requestedItem || !offeredItem || !preview || !ownerPolicyForm || !sharedNetworkPolicyForm) {
    return (
      <main className={shellClass}>
        <section className="loading-shell">
          <p className="eyebrow">{PRODUCT_WORKING_NAME}</p>
          <h1>Loading assembly context...</h1>
          <p className="hero-text">
            {isResolvingData ? "Resolving live locker state..." : "Unable to resolve the Barter Box view model."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <header className="command-bar shell-panel">
        <div className="command-main">
          <div className="command-title">
            <p className="eyebrow">{PRODUCT_WORKING_NAME}</p>
            <h1>{resolvedSnapshot.owner.label}</h1>
          </div>
          {isFullMode ? (
            <div className="command-meta">
              <span>{runtimeLabel}</span>
              <span>{compactAddress(displayedAssemblyId, true)}</span>
            </div>
          ) : null}
        </div>
        <div className="command-actions">
          <div className="state-badges">
            <span className={`status-pill ${resolvedSnapshot.policy.isActive ? "online" : "offline"}`}>
              {operatorStateLabel}
            </span>
            <span className={resolvedSnapshot.trustStatus === "frozen" ? "status-pill muted" : "status-pill accent"}>
              {trustLabel}
            </span>
            <span className="status-pill muted">{marketModeSummary}</span>
          </div>
          {renderModeToggle()}
          {runtimeEnvironment !== "utopia-in-game" ? (
            <button
              className="wallet-button"
              onClick={() => (account ? handleDisconnect() : handleConnect())}
            >
              {account ? abbreviateAddress(account.address) : "Connect Wallet"}
            </button>
          ) : null}
        </div>
      </header>

      <section className={`shell-layout view-${viewMode}`}>
        {renderLeftRail()}
        <section className="shell-panel workspace-shell">
          {renderActiveWorkspaceTabs()}
          <div className="workspace-body">{renderWorkspaceContent()}</div>
        </section>
      </section>

      {renderBottomBar()}
    </main>
  );
}

export default App;
