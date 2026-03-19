import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  abbreviateAddress,
  getCharacterOwnedObjects,
  getObjectsByType,
  TENANT_CONFIG,
  useConnection,
  useSmartObject,
} from "@evefrontier/dapp-kit";
import {
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import {
  PRODUCT_WORKING_NAME,
  TRUST_LOCKER_CATALOG,
  type LockerPolicyDraft,
  type MarketMode,
} from "../trust-locker.config";
import {
  createLocalDemoSignerExecutor,
  executeTrade,
  freezeLockerPolicy,
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
const ASSEMBLY_TYPE_LABEL = "Smart Storage Unit";
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
  status: "idle" | "pending" | "success" | "error";
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
  if (policy.marketMode === "procurement") return "Procurement reserve mode";
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
    ? "Visitor goods go to the owner reserve instead of back onto the public shelf."
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
  const currentClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const { assembly, loading, error } = useSmartObject();

  const [lockerData, setLockerData] = useState<LockerDataEnvelope | null>(null);
  const [viewMode, setViewMode] = useState<UiMode>(readInitialViewMode);
  const [isResolvingData, setIsResolvingData] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [ownerPolicyForm, setOwnerPolicyForm] = useState<OwnerPolicyForm | null>(null);
  const [sharedNetworkPolicyForm, setSharedNetworkPolicyForm] = useState<SharedNetworkPolicyForm | null>(null);
  const [requestedTypeId, setRequestedTypeId] = useState<number>(0);
  const [requestedQuantity, setRequestedQuantity] = useState<number>(1);
  const [offeredTypeId, setOfferedTypeId] = useState<number>(0);
  const [offeredQuantity, setOfferedQuantity] = useState<number>(1);
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
  }, [assembly?.id, assembly?.name, error, preferredReaderAddress, refreshTick, tenant, viewMode]);

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
  const currentNetwork = String(
    ((currentClient as { network?: string } | null)?.network ?? "unknown"),
  );
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
    setNowMs(Date.now());
    setOwnerPolicyForm(buildOwnerPolicyForm(snapshot.policy));
    setSharedNetworkPolicyForm(buildSharedNetworkPolicyForm(snapshot));
    setRequestedTypeId(snapshot.openInventory[0]?.typeId ?? snapshot.policy.acceptedItems[0]?.typeId ?? 0);
    setOfferedTypeId(
      snapshot.visitorInventory[0]?.typeId ?? snapshot.policy.acceptedItems[0]?.typeId ?? 0,
    );
    setRequestedQuantity(1);
    setOfferedQuantity(snapshot.visitorInventory[0] ? 1 : 0);
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
    if (!runtime || !ownerPolicyForm || !actor) {
      setActionState({
        status: "error",
        label: "Save policy",
        message: showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load locker runtime context before saving policy.",
      });
      return;
    }

    const draft = buildDraftFromForm(ownerPolicyForm);
    if (draft.fuelFeeUnits > 0) {
      setActionState({
        status: "error",
        label: "Save policy",
        message: "Fuel fees are still deferred. Set the trade fee to 0 until a real Fuel debit path is proven.",
      });
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
    if (!runtime || !actor) {
      setActionState({
        status: "error",
        label: "Freeze locker",
        message: showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load locker runtime context before freezing.",
      });
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
    if (!runtime || !sharedNetworkPolicyForm || !actor) {
      setActionState({
        status: "error",
        label: "Save strike network",
        message: showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load locker runtime context before saving strike network policy.",
      });
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
    if (!runtime || !actor || !requestedItem || !offeredItem) {
      setActionState({
        status: "error",
        label: "Execute trade",
        message: showLocalDemoSignerPanel
          ? "Load localnet runtime data and configure the local visitor demo signer, or connect a visitor-capable wallet."
          : "Connect the visitor wallet and load live locker data before trading.",
      });
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
  const compactTradeCopy = resolvedPreview.willStrike
    ? "Underpaying will add a strike and lock this locker temporarily."
    : resolvedSnapshot.policy.marketMode === "procurement"
      ? "Accepted goods route to the owner reserve when the trade clears."
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
  const tradeBlockedReason = displayedCooldownActive
    ? `Trading locked while cooldown is active. ${displayedCooldownEndLabel}.`
    : displayedSharedLockoutActive
      ? `Blacklisted by strike network ${resolvedSnapshot.sharedPenalty.policy.scopeId}. ${displayedSharedLockoutLabel}.`
      : resolvedPreview.fuelFeeBlockedReason
        ? resolvedPreview.fuelFeeBlockedReason
      : !runtime
        ? "Local runtime context is not loaded yet."
        : resolvedSnapshot.openInventory.length === 0
          ? "The locker has no open inventory available for trade."
          : !visitorActor
            ? "Configure the local visitor demo signer or connect a visitor-capable wallet."
            : null;
  const tradeButtonLabel = displayedCooldownActive ? "Cooldown active" : "Execute trade";
  const compactActionStatus = actionState.status !== "idle";
  const inContextStatusLabel =
    actionState.status === "success" ? "Transaction complete" : actionState.label;
  const currentViewDefinition: Record<UiMode, ViewDefinition> = {
    visitor: {
      label: "Visitor",
      eyebrow: "Visitor view",
      title: displayedAssemblyName,
      description: "Inspect the shelf, compare your hold, then trade against the published terms.",
    },
    owner: {
      label: "Owner",
      eyebrow: "Owner view",
      title: displayedAssemblyName,
      description: "Set accepted goods, pricing, trust rules, and publish the box without using the debug surface.",
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

  function renderActionSummary(compact = false) {
    if (actionState.status === "idle" && compact) return null;
    return (
      <div className={compact ? "inline-status" : "status-trace"}>
        <p className={`action-status ${actionState.status}`}>{compact ? inContextStatusLabel : actionState.label}</p>
        <p className="support-copy">{actionState.message ?? "No wallet action has been attempted yet."}</p>
        {actionState.digest ? <p className="support-copy">Digest: {actionState.digest}</p> : null}
      </div>
    );
  }

  function renderAssemblyCard(props: { step?: string; description: string; compact: boolean }) {
    return (
      <article className="card assembly-card">
        <StepHeader
          step={props.step}
          title="Assembly Context"
          description={props.description}
        />
        <div className="assembly-hero">
          <div className="assembly-visual" aria-hidden="true">
            <span className="assembly-core" />
            <span className="assembly-fin assembly-fin-a" />
            <span className="assembly-fin assembly-fin-b" />
            <span className="assembly-fin assembly-fin-c" />
          </div>
          <div className="assembly-meta">
            <h2>{displayedAssemblyName}</h2>
            <div className="assembly-badges">
              <span className={resolvedSnapshot.trustStatus === "frozen" ? "trust-pill frozen" : "trust-pill mutable"}>
                {trustLabel}
              </span>
              <span className="runtime-pill">{runtimeLabel}</span>
              <span className={`runtime-pill ${resolvedSnapshot.policy.isActive ? "online" : "offline"}`}>
                {operatorStateLabel}
              </span>
            </div>
            <p className="trust-copy">
              {props.compact
                ? compactTradeCopy
                : "The unit identity, trust status, and runtime come first. Everything else hangs off this object context."}
            </p>
          </div>
        </div>
        <dl className="fact-grid">
          <div>
            <dt>Assembly type</dt>
            <dd>{ASSEMBLY_TYPE_LABEL}</dd>
          </div>
          <div>
            <dt>Owner</dt>
              <dd>{resolvedSnapshot.owner.label}</dd>
          </div>
          <div>
            <dt>Assembly ID</dt>
            <dd>{compactAddress(displayedAssemblyId, props.compact)}</dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>{account?.address ? compactAddress(account.address, props.compact) : "Not connected"}</dd>
          </div>
          <div>
            <dt>Tenant</dt>
            <dd>{runtime?.tenant ?? tenant}</dd>
          </div>
          <div>
            <dt>Wallet network</dt>
            <dd>{currentNetwork}</dd>
          </div>
        </dl>
        {showSupportCopy ? (
          <div className="connection-note">
            {loading && <span>Reading selected smart object...</span>}
            {!loading && lockerData?.notes.map((note) => <span key={note}>{note}</span>)}
          </div>
        ) : null}
      </article>
    );
  }

  function renderTermsCard(props: { step?: string; description: string; compact: boolean }) {
    return (
      <article className="card summary-card">
        <StepHeader
          step={props.step}
          title="Published Terms"
          description={props.description}
        />
        <div className="owner-controls">
          <div>
            <span>Accepted goods</span>
            <strong>{resolvedSnapshot.policy.acceptedItems.length}</strong>
          </div>
          <div>
            <span>Risk posture</span>
            <strong>{buildRiskLabel(resolvedSnapshot.policy)}</strong>
          </div>
          <div>
            <span>Cooldown</span>
            <strong>{resolvedSnapshot.policy.cooldownMs / 1000}s</strong>
          </div>
          <div>
            <span>Market mode</span>
            <strong>{marketModeSummary}</strong>
          </div>
          <div>
            <span>Friendly</span>
            <strong>{resolvedSnapshot.policy.friendlyMultiplierBps / 100}%</strong>
          </div>
          <div>
            <span>Rival</span>
            <strong>{resolvedSnapshot.policy.rivalMultiplierBps / 100}%</strong>
          </div>
          <div>
            <span>Shared network</span>
            <strong>{resolvedSnapshot.policy.useSharedPenalties ? `scope ${resolvedSnapshot.policy.strikeScopeId}` : "isolated"}</strong>
          </div>
          <div>
            <span>Fuel fee</span>
            <strong>{resolvedSnapshot.policy.fuelFeeUnits || "off"}</strong>
          </div>
        </div>
        {!props.compact ? (
          <ul className="policy-list">
            <li>Friendly tribes: {resolvedSnapshot.policy.friendlyTribes.join(", ") || "none"}</li>
            <li>Rival tribes: {resolvedSnapshot.policy.rivalTribes.join(", ") || "none"}</li>
            <li>Market mode: {marketModeSummary} | {marketModeDescription}</li>
            <li>{fuelFeeCopy}</li>
            <li>Shared pricing penalty: {(resolvedSnapshot.sharedPenalty.pricingPenaltyBps / 100).toFixed(2)}%</li>
            <li>Network state: {resolvedSnapshot.sharedPenalty.policy.isActive ? "active" : "inactive"}</li>
          </ul>
        ) : null}
      </article>
    );
  }

  function renderInventoryCard(props: {
    step?: string;
    title: string;
    description: string;
    items: LockerDataEnvelope["snapshot"]["openInventory"];
    empty: string;
    quantityLabel: "open" | "owned" | "reserve";
    compact: boolean;
  }) {
    return (
      <article className="card inventory-card">
        <StepHeader step={props.step} title={props.title} description={props.description} />
        <div className="item-table">
          {props.items.length === 0 ? (
            <p className="empty-state">{props.empty}</p>
          ) : (
            props.items.map((item) => (
              <div key={item.typeId} className="item-row">
                <div className="item-main">
                  <span className={`tier-pill ${item.tier}`}>{item.tier}</span>
                  <strong>{item.label}</strong>
                  {!props.compact ? <p>{item.note}</p> : null}
                </div>
                <div className="item-meta">
                  {!props.compact ? <span>type_id {item.typeId}</span> : null}
                  <span>{item.quantity} {props.quantityLabel}</span>
                  <span>{item.points} pts</span>
                  <span>{formatVolume(item.volumeM3, item.quantity)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    );
  }

  function renderTradeCard(props: { step?: string; description: string; compact: boolean }) {
    return (
      <article className="card trade-card">
        <StepHeader step={props.step} title="Trade Console" description={props.description} />
        <div className="owner-controls trade-summary-grid">
          <div>
            <span>Market mode</span>
            <strong>{marketModeSummary}</strong>
          </div>
          <div>
            <span>Detected bucket</span>
            <strong>{resolvedSnapshot.visitor.relationshipBucket}</strong>
          </div>
          <div>
            <span>Local strikes</span>
            <strong>{resolvedSnapshot.visitor.localStrikeCount}</strong>
          </div>
          <div>
            <span>Shared strikes</span>
            <strong>{resolvedSnapshot.sharedPenalty.penalties.strikeCount}</strong>
          </div>
          <div>
            <span>Local cooldown</span>
            <strong>{displayedCooldownActive ? displayedCooldownEndLabel : "clear"}</strong>
          </div>
          <div>
            <span>Network lockout</span>
            <strong>{displayedSharedLockoutActive ? displayedSharedLockoutLabel : "clear"}</strong>
          </div>
          <div>
            <span>Network penalty</span>
            <strong>{networkPenaltyCopy}</strong>
          </div>
          <div>
            <span>Fuel fee</span>
            <strong>{fuelFeeCopy}</strong>
          </div>
        </div>
        {props.compact ? <p className="trade-copy">{marketModeDescription}</p> : null}
        <div className="trade-grid">
          <label>
            Request item
            <select
              value={requestedTypeId}
              onChange={(event) =>
                startTransition(() => setRequestedTypeId(Number(event.target.value)))
              }
            >
              {resolvedSnapshot.openInventory.map((item) => (
                <option key={item.typeId} value={item.typeId}>
                  {item.label} | {item.quantity} shelf
                </option>
              ))}
            </select>
          </label>
          <label>
            Request qty
            <input
              type="number"
              min={1}
              value={requestedQuantity}
              onChange={(event) =>
                startTransition(() => setRequestedQuantity(Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </label>
          <label>
            Offer item
            <select
              value={offeredTypeId}
              onChange={(event) =>
                startTransition(() => setOfferedTypeId(Number(event.target.value)))
              }
            >
              {resolvedSnapshot.visitorInventory.map((item) => (
                <option key={item.typeId} value={item.typeId}>
                  {item.label} | {item.quantity} hold
                </option>
              ))}
            </select>
          </label>
          <label>
            Offer qty
            <input
              type="number"
              min={0}
              value={offeredQuantity}
              onChange={(event) =>
                startTransition(() => setOfferedQuantity(Math.max(0, Number(event.target.value) || 0)))
              }
            />
          </label>
        </div>

        <div className={resolvedPreview.willStrike ? "preview-card warning" : "preview-card safe"}>
          <p className="preview-pill">
            {resolvedPreview.willStrike ? "Underpaying: strike + cooldown" : "Fair trade"}
          </p>
          <p className="preview-detail">
            {props.compact
              ? compactTradeCopy
              : "This preview mirrors the on-chain math using the published policy, detected bucket, and any shared penalty already attached to the visitor."}
          </p>
          <div className="preview-metrics">
            <div>
              <span>Request total</span>
              <strong>{resolvedPreview.effectiveRequestedPoints}</strong>
            </div>
            {!props.compact ? (
              <div>
                <span>Base request</span>
                <strong>{resolvedPreview.baseRequestedPoints}</strong>
              </div>
            ) : null}
            <div>
              <span>Offer total</span>
              <strong>{resolvedPreview.offeredPoints}</strong>
            </div>
            <div>
              <span>Request volume</span>
              <strong>{formatVolume(resolvedPreview.requestedItem.volumeM3, resolvedPreview.requestedQuantity)}</strong>
            </div>
            <div>
              <span>Offer volume</span>
              <strong>{formatVolume(resolvedPreview.offeredItem.volumeM3, resolvedPreview.offeredQuantity)}</strong>
            </div>
            <div>
              <span>Deficit</span>
              <strong>{resolvedPreview.deficitPoints}</strong>
            </div>
            <div>
              <span>Fuel fee</span>
              <strong>{resolvedPreview.fuelFeeUnits > 0 ? `${resolvedPreview.fuelFeeUnits} Fuel` : "0"}</strong>
            </div>
            {!props.compact ? (
              <>
                <div>
                  <span>Bucket multiplier</span>
                  <strong>{(resolvedPreview.pricingMultiplierBps / 100).toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Network penalty</span>
                  <strong>{(resolvedPreview.sharedPricingPenaltyBps / 100).toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Strike scope</span>
                  <strong>{resolvedPreview.sharedPenaltyScopeId || "isolated"}</strong>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {tradeBlockedReason ? (
          <div className="cooldown-callout">
            <p className="preview-pill">Trade locked</p>
            <p className="preview-detail">{tradeBlockedReason}</p>
          </div>
        ) : null}

        <div className="action-row">
          <button
            className="primary-action"
            disabled={Boolean(tradeBlockedReason)}
            onClick={() => void handleTrade()}
          >
            {tradeButtonLabel}
          </button>
          <button className="secondary-action" onClick={() => void refreshLockerContext()}>
            Refresh
          </button>
        </div>
        {props.compact ? renderActionSummary(true) : null}
        {!props.compact && showSupportCopy ? (
          <>
            <p className="support-copy">
              Trading uses the visitor path only. The owner does not transfer goods directly; visitors trade against the open shelf inventory inside the unit.
            </p>
            <p className="support-copy">
              {marketModeDescription}
            </p>
            <p className="support-copy">
              Cooldown and shared-network lockout are surfaced separately so the user can tell whether the block is local to this box or persistent across a strike network.
            </p>
          </>
        ) : null}
      </article>
    );
  }

  function renderOwnerCard(props: { step?: string; description: string; compact: boolean }) {
    return (
      <article className="card owner-card">
        <StepHeader step={props.step} title="Owner Console" description={props.description} />

        <div className="owner-stage-grid">
          <div className="owner-stage">
            <p className="preview-pill">{props.compact ? "1. Confirm unit" : "Current box state"}</p>
            <div className="owner-controls compact">
              <div>
                <span>Trust status</span>
                <strong>{trustLabel}</strong>
              </div>
              <div>
                <span>Policy status</span>
                <strong>{resolvedSnapshot.policy.isActive ? "active" : "inactive"}</strong>
              </div>
              <div>
                <span>Owner wallet</span>
                <strong>{ownerActor ? compactAddress(ownerActor.senderAddress, props.compact) : "not ready"}</strong>
              </div>
            </div>
          </div>

          <div className="owner-stage">
            <p className="preview-pill">{props.compact ? "2. Choose accepted goods" : "Accepted goods"}</p>
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
                        <small>{props.compact ? `${item.volumeM3} m3` : `type_id ${item.typeId}`}</small>
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
          </div>
        </div>

        <div className="owner-stage-grid">
          <div className="owner-stage">
            <p className="preview-pill">{props.compact ? "3. Set trade terms" : "Trade terms"}</p>
            <div className="trade-grid">
              <label>
                Friendly tribes
                <input
                  value={resolvedOwnerPolicyForm.friendlyTribesText}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current ? { ...current, friendlyTribesText: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Rival tribes
                <input
                  value={resolvedOwnerPolicyForm.rivalTribesText}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current ? { ...current, rivalTribesText: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Friendly multiplier (bps)
                <input
                  type="number"
                  min={0}
                  value={resolvedOwnerPolicyForm.friendlyMultiplierBps}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current
                        ? { ...current, friendlyMultiplierBps: Math.max(0, Number(event.target.value) || 0) }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Rival multiplier (bps)
                <input
                  type="number"
                  min={0}
                  value={resolvedOwnerPolicyForm.rivalMultiplierBps}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current
                        ? { ...current, rivalMultiplierBps: Math.max(0, Number(event.target.value) || 0) }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Market mode
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
              <label>
                Trade fee (Fuel)
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
              <label>
                Cooldown (ms)
                <input
                  type="number"
                  min={0}
                  value={resolvedOwnerPolicyForm.cooldownMs}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current
                        ? { ...current, cooldownMs: Math.max(0, Number(event.target.value) || 0) }
                        : current,
                    )
                  }
                />
              </label>
              <label className="checkbox-row">
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
            </div>
          </div>

          <div className="owner-stage">
            <p className="preview-pill">{props.compact ? "4. Set shared penalty behavior" : "Shared penalty network"}</p>
            <div className="trade-grid">
              <label className="checkbox-row">
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
              <label>
                Strike scope ID
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
              <label>
                Penalty / strike (bps)
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
              <label>
                Max penalty (bps)
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
              <label>
                Lockout threshold
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
              <label>
                Lockout duration (ms)
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
              <label className="checkbox-row">
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
            </div>
            <div className="preview-card neutral owner-preview-card">
              <p className="preview-pill">Draft posture</p>
              <p className="preview-detail">
                {buildRiskLabel(ownerDraft)}. {marketModeCopy(ownerDraft.marketMode)}
              </p>
              <div className="owner-controls compact">
                <div>
                  <span>Market mode</span>
                  <strong>{marketModeLabel(ownerDraft.marketMode)}</strong>
                </div>
                <div>
                  <span>Shared scope</span>
                  <strong>{ownerDraft.useSharedPenalties ? ownerDraft.strikeScopeId : "isolated"}</strong>
                </div>
                <div>
                  <span>Network state</span>
                  <strong>{ownerDraft.useSharedPenalties ? "enabled" : "disabled"}</strong>
                </div>
                <div>
                  <span>Lockout threshold</span>
                  <strong>{resolvedSharedNetworkPolicyForm.lockoutStrikeThreshold}</strong>
                </div>
                <div>
                  <span>Fuel fee</span>
                  <strong>{ownerDraft.fuelFeeUnits > 0 ? `${ownerDraft.fuelFeeUnits} Fuel` : "deferred"}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="owner-stage">
          <p className="preview-pill">{props.compact ? "Reserve" : "Owner reserve"}</p>
          <p className="preview-detail">
            Procurement receipts land in the owner inventory inside this same storage unit. Extraction still uses the normal Storage Unit owner flow.
          </p>
          <div className="item-table">
            {resolvedSnapshot.ownerReserveInventory.length === 0 ? (
              <p className="empty-state">Owner reserve is empty right now.</p>
            ) : (
              resolvedSnapshot.ownerReserveInventory.map((item) => (
                <div key={item.typeId} className="item-row">
                  <div className="item-main">
                    <span className={`tier-pill ${item.tier}`}>{item.tier}</span>
                    <strong>{item.label}</strong>
                  </div>
                  <div className="item-meta">
                    <span>{item.quantity} reserve</span>
                    <span>{item.points} pts</span>
                    <span>{formatVolume(item.volumeM3, item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="owner-stage owner-publish-stage">
          <p className="preview-pill">{props.compact ? "5. Publish" : "Publish and freeze"}</p>
          <p className="preview-detail">
            Save the ruleset first. Freeze only when the box terms are final because the freeze is irreversible.
          </p>
          <div className="action-row">
            <button
              className="secondary-action"
              disabled={!runtime || resolvedSnapshot.policy.isFrozen || !resolvedSnapshot.owner.canEditSharedPenaltyPolicy || !ownerActor}
              onClick={() => void handleSharedNetworkPolicySave()}
            >
              Save strike network
            </button>
            <button
              className="primary-action"
              disabled={!runtime || resolvedSnapshot.policy.isFrozen || !ownerActor}
              onClick={() => void handlePolicySave()}
            >
              Save policy
            </button>
            <button
              className="secondary-action"
              disabled={!runtime || resolvedSnapshot.policy.isFrozen || !ownerActor}
              onClick={() => void handleFreeze()}
            >
              Freeze locker
            </button>
          </div>
          {props.compact ? renderActionSummary(true) : null}
        </div>

        {!props.compact && showSupportCopy ? (
          <>
            <p className="support-copy">
              Owner actions use the owner character `{runtime?.ownerCharacterId ?? "n/a"}`. On localnet, this surface can use the local demo signer. Hosted Utopia requires a real wallet path.
            </p>
            <p className="support-copy">
              Fuel fees are schema-ready but still deferred until a real visitor-side Fuel debit path exists in the world contracts.
            </p>
            <p className="support-copy">
              Stocking inventory remains outside the owner UI in this phase. Seed open inventory and use normal Storage Unit owner inventory flow for reserve collection.
            </p>
          </>
        ) : null}
      </article>
    );
  }

  function renderLocalSignerPanel() {
    if (!showLocalDemoSignerPanel) return null;
    return (
      <article className="card local-demo-card">
        <StepHeader
          title="Local Demo Signer"
          description="Unsafe local-only browser signing for localnet proof when a wallet extension cannot talk to custom RPC."
        />
        <div className="owner-callout">
          <p>Paste local `suiprivkey...` values only. Never use testnet or mainnet secrets here.</p>
        </div>
        <div className="signer-grid">
          <label>
            Owner signer secret
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
          <label>
            Visitor signer secret
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
        <div className="signer-status-grid">
          <div className="signer-status-card">
            <span>Owner signer</span>
            <strong>
              {ownerLocalSigner.address
                ? abbreviateAddress(ownerLocalSigner.address)
                : ownerLocalSigner.configured
                  ? "Invalid secret"
                  : "Not configured"}
            </strong>
            <small>{ownerLocalSigner.error ?? "Accepts owner or admin localnet key."}</small>
          </div>
          <div className="signer-status-card">
            <span>Visitor signer</span>
            <strong>
              {visitorLocalSigner.address
                ? abbreviateAddress(visitorLocalSigner.address)
                : visitorLocalSigner.configured
                  ? "Invalid secret"
                  : "Not configured"}
            </strong>
            <small>{visitorLocalSigner.error ?? "Accepts visitor or admin localnet key."}</small>
          </div>
        </div>
        <div className="action-row">
          <button className="primary-action" onClick={persistLocalDemoSignerDraft}>
            Save local signer secrets
          </button>
          <button className="secondary-action" onClick={clearLocalDemoSignerDraft}>
            Clear local signer secrets
          </button>
        </div>
        {localDemoSignerMessage ? <p className="support-copy">{localDemoSignerMessage}</p> : null}
      </article>
    );
  }

  function renderDiscoveryPanel() {
    if (!showDiscoveryPanel) return null;
    return (
      <article className="card discovery-card">
        <StepHeader
          title="Utopia Object Discovery"
          description="Use this when the game UI does not surface a usable itemId. It discovers owned or public Utopia objects from the browser."
        />
        <div className="action-row">
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
        <p className="support-copy">
          Connected wallet: {account?.address ?? "not connected"}. Public-object discovery works without ownership and is the correct fallback if you have not finished the tutorial.
        </p>
        {ownedObjectsMessage ? <p className="support-copy">{ownedObjectsMessage}</p> : null}
        <ul className="signal-list">
          {ownedObjectCandidates.length === 0 ? (
            <li className="empty-state">No candidate objects loaded yet.</li>
          ) : (
            ownedObjectCandidates.map((candidate) => {
              const candidateTenant = candidate.tenant || "utopia";
              const utopiaUrl = `https://uat.dapps.evefrontier.com/?tenant=${candidateTenant}&itemId=${candidate.itemId}`;
              return (
                <li key={`${candidate.itemId}-${candidate.objectId ?? candidate.typeId}`}>
                  <strong>{candidate.name}</strong>
                  <span>itemId: {candidate.itemId}</span>
                  <span>tenant: {candidateTenant}</span>
                  <span>type_id: {candidate.typeId}</span>
                  <span>source: {candidate.source}</span>
                  {candidate.objectId ? <small>objectId: {candidate.objectId}</small> : null}
                  <small>{utopiaUrl}</small>
                </li>
              );
            })
          )}
        </ul>
      </article>
    );
  }

  function renderSignalsPanel() {
    if (!showSignalsPanel) return null;
    return (
      <article className="card signals-card">
        <StepHeader
          title="Recent Locker Signals"
          description="Recent events stay at the end of the walkthrough because they are proof and audit aids, not core user interaction."
        />
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
      </article>
    );
  }

  function renderFullFlow() {
    return (
      <>
        {renderAssemblyCard({
          step: "01",
          description: "Start with the unit identity, runtime, trust state, and owner before you inspect any terms.",
          compact: false,
        })}
        {renderTermsCard({
          step: "02",
          description: "These are the published trade terms visitors will be measured against.",
          compact: false,
        })}
        <div className="paired-grid">
          {renderInventoryCard({
            step: "03A",
            title: "Locker Shelf",
            description: "This is the public stock a visitor can request from the box.",
            items: resolvedSnapshot.openInventory,
            empty: "No open inventory entries are available right now.",
            quantityLabel: "open",
            compact: false,
          })}
          {renderInventoryCard({
            step: "03B",
            title: "Visitor Hold",
            description: "This is the visitor-side inventory inside the same unit that can be offered back to the box.",
            items: resolvedSnapshot.visitorInventory,
            empty: "No visitor-owned inventory entries are available right now.",
            quantityLabel: "owned",
            compact: false,
          })}
          {renderInventoryCard({
            step: "03C",
            title: "Owner Reserve",
            description: "Procurement-mode receipts land here inside the same storage unit until the owner extracts or restocks them.",
            items: resolvedSnapshot.ownerReserveInventory,
            empty: "No owner reserve entries are available right now.",
            quantityLabel: "reserve",
            compact: false,
          })}
        </div>
        {showVisitorWorkspace
          ? renderTradeCard({
              step: "04 / 05",
              description: "Preview a trade, then execute it with the visitor path. The result surfaces local and shared trust consequences immediately.",
              compact: false,
            })
          : null}
        {showOwnerWorkspace
          ? renderOwnerCard({
              step: "06",
              description: "Configure the box policy and shared strike network with a guided owner workflow.",
              compact: false,
            })
          : null}
        <article className="card status-trace-card">
          <StepHeader
            step="07"
            title="Debug and Proof Tools"
            description="Operator-only tooling sits last so it cannot obscure the normal order of operations."
          />
          {renderActionSummary(false)}
          {showSupportCopy ? (
            <p className="support-copy">
              Localnet proof can use the explicit local-only demo signer path. Hosted Utopia flows must use a real wallet connection and never expose local-only controls.
            </p>
          ) : null}
        </article>
        {renderLocalSignerPanel()}
        {renderDiscoveryPanel()}
        {renderSignalsPanel()}
      </>
    );
  }

  function renderVisitorFlow() {
    return (
      <>
        {renderAssemblyCard({
          description: "Inspect the object, trust state, and runtime before interacting with the shelf.",
          compact: true,
        })}
        {renderInventoryCard({
          title: "Locker Shelf",
          description: "Available goods",
          items: resolvedSnapshot.openInventory,
          empty: "No shelf items available right now.",
          quantityLabel: "open",
          compact: true,
        })}
        {renderInventoryCard({
          title: "Your Hold",
          description: "Goods you can offer into the box",
          items: resolvedSnapshot.visitorInventory,
          empty: "No visitor hold items available right now.",
          quantityLabel: "owned",
          compact: true,
        })}
        {showVisitorWorkspace
          ? renderTradeCard({
              description: "Choose what to take, what to offer, then execute the exchange.",
              compact: true,
            })
          : null}
      </>
    );
  }

  function renderOwnerFlow() {
    return (
      <>
        {renderAssemblyCard({
          step: "1",
          description: "Confirm you are editing the right unit and that the policy is still mutable.",
          compact: true,
        })}
        {renderTermsCard({
          step: "2",
          description: "Review the current published terms before you change them.",
          compact: true,
        })}
        {renderInventoryCard({
          step: "Reserve",
          title: "Owner Reserve",
          description: "Procurement receipts accumulate here for later extraction through the standard Storage Unit owner flow.",
          items: resolvedSnapshot.ownerReserveInventory,
          empty: "Owner reserve is empty right now.",
          quantityLabel: "reserve",
          compact: true,
        })}
        {showOwnerWorkspace
          ? renderOwnerCard({
              step: "3 / 4 / 5",
              description: "Choose accepted goods, set trade terms, attach shared penalties if needed, then publish.",
              compact: true,
            })
          : null}
      </>
    );
  }

  let mainContent: ReactNode;
  if (isFullMode) {
    mainContent = renderFullFlow();
  } else if (isOwnerMode) {
    mainContent = renderOwnerFlow();
  } else {
    mainContent = renderVisitorFlow();
  }

  return (
    <main className={shellClass}>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{PRODUCT_WORKING_NAME} | {currentViewDefinition[viewMode].eyebrow}</p>
          <h1>{currentViewDefinition[viewMode].title}</h1>
          <p className="hero-text">{currentViewDefinition[viewMode].description}</p>
        </div>
        <div className="hero-actions">
          {renderModeToggle()}
          <span className="mode-hint">Tab cycles views</span>
          <button
            className="wallet-button"
            onClick={() => (account ? handleDisconnect() : handleConnect())}
          >
            {account ? abbreviateAddress(account.address) : "Connect Wallet"}
          </button>
        </div>
      </section>

      <section className={`layout-grid layout-${viewMode}`}>
        {mainContent}
      </section>
    </main>
  );
}

export default App;
