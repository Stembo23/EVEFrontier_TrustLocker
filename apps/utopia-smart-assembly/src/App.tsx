import { startTransition, useEffect, useMemo, useState } from "react";
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
import type { LockerDataEnvelope, UiMode } from "./models";
import { quoteTradePreview } from "./trustMath";

const LOCAL_DEMO_SIGNER_STORAGE_KEY = "trust-locker.local-demo-signer.v1";
const VIEW_MODE_STORAGE_KEY = "trust-locker.view-mode.v1";

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
    cooldownMs: Math.max(0, Number(form.cooldownMs)),
    strikeScopeId: Math.max(0, Number(form.strikeScopeId)),
    useSharedPenalties: form.useSharedPenalties,
    isActive: form.isActive,
    isFrozen: false,
  };
}

function buildRiskLabel(policy: LockerPolicyDraft): string {
  if (policy.useSharedPenalties) return "Federated trust network";
  if (policy.rivalMultiplierBps >= 13_000) return "Hostile rival pricing";
  if (policy.friendlyMultiplierBps < 10_000) return "Preferential friendly pricing";
  return "Balanced published pricing";
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

function normalizeViewMode(value: string | null | undefined): UiMode | null {
  if (value === "full" || value === "in-game") return value;
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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsResolvingData(true);
      const envelope = await resolveLockerData({
        assemblyId: assembly?.id,
        assemblyName: assembly?.name,
        smartObjectError: error ? String(error) : null,
        walletAddress: preferredReaderAddress,
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
  }, [assembly?.id, assembly?.name, error, preferredReaderAddress, refreshTick]);

  const snapshot = lockerData?.snapshot;
  const runtime = lockerData?.runtime;
  const currentNetwork = String(
    ((currentClient as { network?: string } | null)?.network ?? "unknown"),
  );
  const isInGameMode = viewMode === "in-game";
  const showFullDetail = viewMode === "full";
  const localDemoSignerAllowed = runtime?.network === "localnet";
  const showLocalDemoSignerPanel = showFullDetail && localDemoSignerAllowed;
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

    if (!hasActiveTimer) {
      return;
    }

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
      setViewMode((current) => (current === "full" ? "in-game" : "full"));
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
    } catch (error) {
      setOwnedObjectsMessage(error instanceof Error ? error.message : String(error));
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
    } catch (error) {
      setOwnedObjectsMessage(error instanceof Error ? error.message : String(error));
      setOwnedObjectCandidates([]);
    } finally {
      setIsLoadingOwnedObjects(false);
    }
  }

  function resolveActorExecution(role: "owner" | "visitor"): {
    senderAddress: string;
    executor: WalletTxExecutor;
    mode: "local-demo-signer" | "wallet";
  } | null {
    if (localDemoSignerAllowed) {
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

  async function handlePolicySave() {
    const actor = resolveActorExecution("owner");
    if (!runtime || !ownerPolicyForm || !actor) {
      setActionState({
        status: "error",
        label: "Save policy",
        message: localDemoSignerAllowed
          ? "Load localnet runtime data and configure the local owner demo signer, or connect an owner-capable wallet."
          : "Connect the owner wallet and load locker runtime context before saving policy.",
      });
      return;
    }

    const draft = buildDraftFromForm(ownerPolicyForm);
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
        message: localDemoSignerAllowed
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
        message: localDemoSignerAllowed
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
        message: localDemoSignerAllowed
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

  if (!snapshot || !requestedItem || !offeredItem || !preview || !ownerPolicyForm || !sharedNetworkPolicyForm) {
    return (
      <main className={`app-shell ${isInGameMode ? "mode-in-game" : "mode-full"}`}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{PRODUCT_WORKING_NAME} MVP</p>
            <h1>Loading assembly context...</h1>
            <p className="hero-text">
              {isResolvingData ? "Resolving live locker state..." : "Unable to resolve the Trust Locker view model."}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const trustLabel = snapshot.trustStatus === "frozen" ? "Frozen ruleset" : "Mutable ruleset";
  const trustDetail =
    snapshot.trustStatus === "frozen"
      ? "The owner can no longer change pricing or tribe policy for this locker."
      : "The owner can still change pricing or tribe policy until the locker is frozen.";
  const ownerDraft = buildDraftFromForm(ownerPolicyForm);
  const displayedCooldownEndLabel = formatCooldownCountdown(
    snapshot.visitor.localCooldownEndTimestampMs,
    nowMs,
  );
  const displayedSharedLockoutLabel = formatCooldownCountdown(
    snapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs,
    nowMs,
    "No network lockout",
    "Network lockout expired",
  );
  const displayedCooldownActive = Boolean(
    snapshot.visitor.localCooldownEndTimestampMs &&
      snapshot.visitor.localCooldownEndTimestampMs > nowMs,
  );
  const displayedSharedLockoutActive = Boolean(
    snapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs &&
      snapshot.sharedPenalty.penalties.networkCooldownEndTimestampMs > nowMs,
  );
  const tradeBlockedReason = displayedCooldownActive
    ? `Trading locked while cooldown is active. ${displayedCooldownEndLabel}.`
    : displayedSharedLockoutActive
      ? `Blacklisted by strike network ${snapshot.sharedPenalty.policy.scopeId}. ${displayedSharedLockoutLabel}.`
    : !runtime
      ? "Local runtime context is not loaded yet."
      : snapshot.openInventory.length === 0
        ? "The locker has no open inventory available for trade."
        : !visitorActor
          ? "Configure the local visitor demo signer or connect a visitor-capable wallet."
          : null;
  const tradeButtonLabel = displayedCooldownActive ? "Cooldown active" : "Execute trade";

  return (
    <main className={`app-shell ${isInGameMode ? "mode-in-game" : "mode-full"}`}>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{PRODUCT_WORKING_NAME} {isInGameMode ? "in-game mode" : "full-detail mode"}</p>
          <h1>{isInGameMode ? "Assembly market interface" : "Assembly context first. Market rules second."}</h1>
          <p className="hero-text">
            {isInGameMode
              ? "Player-facing assembly view: trust state, inventory, pricing, and trade action."
              : "This external dApp follows the EVE Frontier assembly flow: identify the assembly, inspect its rules, then act as the owner or as a visitor with full visibility into the consequences."}
          </p>
        </div>
        <div className="hero-actions">
          <button
            className="secondary-action mode-toggle"
            onClick={() => setViewMode((current) => (current === "full" ? "in-game" : "full"))}
          >
            Mode: {isInGameMode ? "In-Game" : "Full Detail"} | Tab
          </button>
          <button
            className="wallet-button"
            onClick={() => (account ? handleDisconnect() : handleConnect())}
          >
            {account ? abbreviateAddress(account.address) : "Connect Wallet"}
          </button>
        </div>
      </section>

      <section className="layout-grid">
        <article className="card status-card">
          <p className="section-label">Assembly Context</p>
          <h2>{assembly?.name || snapshot.lockerName}</h2>
          <p className={snapshot.trustStatus === "frozen" ? "trust-pill frozen" : "trust-pill mutable"}>
            {trustLabel}
          </p>
          <p className="trust-copy">{trustDetail}</p>
          <dl className="fact-grid">
            <div>
              <dt>Assembly ID</dt>
              <dd>{assembly?.id || snapshot.lockerId}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{snapshot.owner.label}</dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{account?.address ?? "Not connected"}</dd>
            </div>
            <div>
              <dt>Wallet network</dt>
              <dd>{currentNetwork}</dd>
            </div>
            <div>
              <dt>Tenant</dt>
              <dd>{runtime?.tenant ?? "demo"}</dd>
            </div>
            <div>
              <dt>Data source</dt>
              <dd>{lockerData?.source}</dd>
            </div>
          </dl>
          <div className="connection-note">
            {loading && <span>Reading selected smart object...</span>}
            {!loading && lockerData?.notes.map((note) => <span key={note}>{note}</span>)}
          </div>
        </article>

        {showLocalDemoSignerPanel ? (
        <article className="card local-demo-card">
          <p className="section-label">Local Demo Signer</p>
          <div className="owner-callout">
            <p>
              This unsafe signer path exists only for localnet browser proof. Paste local demo
              `suiprivkey...` values here if you want the browser UI to submit owner and visitor
              transactions without relying on a wallet extension that supports custom RPC.
            </p>
            <p>
              Do not use testnet or mainnet secrets here. Utopia/testnet still uses a real wallet
              connection.
            </p>
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
          {localDemoSignerMessage ? (
            <p className="support-copy">{localDemoSignerMessage}</p>
          ) : null}
          <p className="support-copy">
            Local demo signer mode is {localDemoSignerAllowed ? "available" : "disabled"} for the
            current runtime. It only activates automatically on localnet.
          </p>
        </article>
        ) : null}

        {showFullDetail ? (
        <article className="card discovery-card">
          <p className="section-label">Utopia Object Discovery</p>
          <div className="owner-callout">
            <p>
              Use this when the in-game UI does not expose a usable `itemId`. Connect EVE Vault on
              testnet/Utopia, then load owned objects from the connected wallet.
            </p>
            <p>
              This panel can also query public Utopia storage units, gates, and network nodes directly,
              so you do not need to own an object just to get a sample `itemId`.
            </p>
          </div>
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
            Connected wallet: {account?.address ?? "not connected"}. Owned-object discovery uses the
            connected wallet. Public-object discovery does not require ownership and is the right path
            if you have not finished the tutorial yet.
          </p>
          {ownedObjectsMessage ? <p className="support-copy">{ownedObjectsMessage}</p> : null}
          <ul className="signal-list">
            {ownedObjectCandidates.length === 0 ? (
              <li className="empty-state">No candidate objects loaded yet.</li>
            ) : (
              ownedObjectCandidates.map((candidate) => {
                const tenant = candidate.tenant || "utopia";
                const utopiaUrl = `https://uat.dapps.evefrontier.com/?tenant=${tenant}&itemId=${candidate.itemId}`;
                return (
                  <li key={`${candidate.itemId}-${candidate.objectId ?? candidate.typeId}`}>
                    <strong>{candidate.name}</strong>
                    <span>itemId: {candidate.itemId}</span>
                    <span>tenant: {tenant}</span>
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
        ) : null}

        <article className="card summary-card">
          <p className="section-label">{showFullDetail ? "Locker Summary" : "Behavior"}</p>
          <div className="owner-controls">
            <div>
              <span>Accepted items</span>
              <strong>{snapshot.policy.acceptedItems.length}</strong>
            </div>
            <div>
              <span>Policy active</span>
              <strong>{snapshot.policy.isActive ? "yes" : "no"}</strong>
            </div>
            <div>
              <span>Risk posture</span>
              <strong>{buildRiskLabel(snapshot.policy)}</strong>
            </div>
            <div>
              <span>Cooldown</span>
              <strong>{snapshot.policy.cooldownMs / 1000}s</strong>
            </div>
            <div>
              <span>Shared network</span>
              <strong>
                {snapshot.policy.useSharedPenalties
                  ? `scope ${snapshot.policy.strikeScopeId}`
                  : "isolated"}
              </strong>
            </div>
            <div>
              <span>Network surcharge</span>
              <strong>{(snapshot.sharedPenalty.pricingPenaltyBps / 100).toFixed(2)}%</strong>
            </div>
          </div>
          <ul className="policy-list">
            <li>Friendly multiplier: {snapshot.policy.friendlyMultiplierBps / 100}%</li>
            <li>Neutral multiplier: 100%</li>
            <li>Rival multiplier: {snapshot.policy.rivalMultiplierBps / 100}%</li>
            <li>Friendly tribes: {snapshot.policy.friendlyTribes.join(", ") || "none"}</li>
            <li>Rival tribes: {snapshot.policy.rivalTribes.join(", ") || "none"}</li>
            <li>Shared penalties: {snapshot.policy.useSharedPenalties ? "enabled" : "disabled"}</li>
          </ul>
        </article>

        <article className="card inventory-card">
          <p className="section-label">Open Inventory</p>
          <div className="item-table">
            {snapshot.openInventory.length === 0 ? (
              <p className="empty-state">No open inventory entries are available right now.</p>
            ) : (
              snapshot.openInventory.map((item) => (
                <div key={item.typeId} className="item-row">
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.note}</p>
                  </div>
                  <div className="item-meta">
                    <span>type_id {item.typeId}</span>
                    <span>{item.quantity} open</span>
                    <span>{item.points} pts</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="card inventory-card">
          <p className="section-label">Visitor Owned Inventory</p>
          <div className="item-table">
            {snapshot.visitorInventory.length === 0 ? (
              <p className="empty-state">No visitor-owned inventory entries are available right now.</p>
            ) : (
              snapshot.visitorInventory.map((item) => (
                <div key={item.typeId} className="item-row">
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.note}</p>
                  </div>
                  <div className="item-meta">
                    <span>type_id {item.typeId}</span>
                    <span>{item.quantity} owned</span>
                    <span>{item.points} pts</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="card trade-card">
          <p className="section-label">{showFullDetail ? "Visitor Session + Trade" : "Trade Console"}</p>
          <div className="owner-controls">
            <div>
              <span>Detected bucket</span>
              <strong>{snapshot.visitor.relationshipBucket}</strong>
            </div>
            <div>
              <span>Strikes at this locker</span>
              <strong>{snapshot.visitor.localStrikeCount}</strong>
            </div>
            <div>
              <span>Shared network strikes</span>
              <strong>{snapshot.sharedPenalty.penalties.strikeCount}</strong>
            </div>
            <div>
              <span>Local cooldown</span>
              <strong>{displayedCooldownActive ? "active" : "clear"}</strong>
            </div>
            <div>
              <span>Local cooldown until</span>
              <strong>{displayedCooldownEndLabel}</strong>
            </div>
            <div>
              <span>Network lockout</span>
              <strong>{displayedSharedLockoutActive ? "active" : "clear"}</strong>
            </div>
            <div>
              <span>Network lockout until</span>
              <strong>{displayedSharedLockoutLabel}</strong>
            </div>
          </div>
          <div className="trade-grid">
            <label>
              Request item
              <select
                value={requestedTypeId}
                onChange={(event) =>
                  startTransition(() => setRequestedTypeId(Number(event.target.value)))
                }
              >
                {snapshot.openInventory.map((item) => (
                  <option key={item.typeId} value={item.typeId}>
                    type_id {item.typeId} | {item.label} ({item.quantity} open)
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
                {snapshot.visitorInventory.map((item) => (
                  <option key={item.typeId} value={item.typeId}>
                    type_id {item.typeId} | {item.label} ({item.quantity} owned)
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

          <div className={preview.willStrike ? "preview-card warning" : "preview-card safe"}>
            <p className="preview-pill">
              {preview.willStrike ? "Underpaying: strike + cooldown" : "Fair trade"}
            </p>
            <p className="preview-detail">
              This preview uses the published locker policy, the detected relationship bucket, and any shared strike-network surcharge currently attached to this visitor.
            </p>
            <div className="preview-metrics">
              <div>
                <span>Base request</span>
                <strong>{preview.baseRequestedPoints}</strong>
              </div>
              <div>
                <span>Effective request</span>
                <strong>{preview.effectiveRequestedPoints}</strong>
              </div>
              <div>
                <span>Offered points</span>
                <strong>{preview.offeredPoints}</strong>
              </div>
              <div>
                <span>Deficit</span>
                <strong>{preview.deficitPoints}</strong>
              </div>
              <div>
                <span>Multiplier</span>
                <strong>{(preview.pricingMultiplierBps / 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>Network penalty</span>
                <strong>{(preview.sharedPricingPenaltyBps / 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>Shared scope</span>
                <strong>{preview.sharedPenaltyScopeId || "isolated"}</strong>
              </div>
            </div>
            {preview.sharedPenaltyLockoutActive ? (
              <p className="preview-detail">
                Shared trust network lockout: {preview.sharedPenaltyLockoutLabel}
              </p>
            ) : null}
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
          {showFullDetail ? (
            <>
              <p className="support-copy">
                Trading uses the demo visitor character `{runtime?.visitorCharacterId ?? "n/a"}`. On
                localnet, this panel can use the local demo signer instead of a wallet extension. For
                Utopia/testnet, use a real wallet connection.
              </p>
              <p className="support-copy">
                Cooldown is enforced as a UI lock after dishonest trades. Shared-network lockout, when enabled,
                is evaluated before trade execution and surfaced here separately from local cooldown.
              </p>
            </>
          ) : null}
        </article>

        <article className="card owner-card">
          <p className="section-label">{showFullDetail ? "Owner Governance" : "Edit Unit"}</p>
          <div className="owner-callout">
            <p>
              This panel follows the base assembly edit flow: inspect the current policy, change it transparently,
              then freeze it when the market terms are final.
            </p>
            <p>
              Locker branding and general assembly metadata remain part of the existing EVE Frontier Edit Unit flow.
              Trust Locker-specific owner control starts here.
            </p>
          </div>

          <div className="catalog-editor">
            {TRUST_LOCKER_CATALOG.map((item) => {
              const enabled = ownerPolicyForm.enabledTypeIds.includes(item.typeId);
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
                      <small>type_id {item.typeId}</small>
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    disabled={!enabled}
                    value={ownerPolicyForm.pointsByTypeId[item.typeId] ?? item.points}
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

          <div className="trade-grid">
            <label>
              Friendly tribes
              <input
                value={ownerPolicyForm.friendlyTribesText}
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
                value={ownerPolicyForm.rivalTribesText}
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
                value={ownerPolicyForm.friendlyMultiplierBps}
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
                value={ownerPolicyForm.rivalMultiplierBps}
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
              Cooldown (ms)
              <input
                type="number"
                min={0}
                value={ownerPolicyForm.cooldownMs}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current
                      ? { ...current, cooldownMs: Math.max(0, Number(event.target.value) || 0) }
                      : current,
                  )
                }
              />
            </label>
            {showFullDetail ? (
              <label>
                Strike scope ID
                <input
                  type="number"
                  min={0}
                  value={ownerPolicyForm.strikeScopeId}
                  onChange={(event) =>
                    setOwnerPolicyForm((current) =>
                      current
                        ? { ...current, strikeScopeId: Math.max(0, Number(event.target.value) || 0) }
                        : current,
                    )
                  }
                />
              </label>
            ) : null}
            <label className="checkbox-row">
              <span>Policy active</span>
              <input
                type="checkbox"
                checked={ownerPolicyForm.isActive}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current ? { ...current, isActive: event.target.checked } : current,
                  )
                }
              />
            </label>
            <label className="checkbox-row">
              <span>Use shared penalties</span>
              <input
                type="checkbox"
                checked={ownerPolicyForm.useSharedPenalties}
                onChange={(event) =>
                  setOwnerPolicyForm((current) =>
                    current ? { ...current, useSharedPenalties: event.target.checked } : current,
                  )
                }
              />
            </label>
          </div>

          <div className="preview-card neutral">
            <p className="preview-pill">Published owner draft</p>
            <p className="preview-detail">
              {buildRiskLabel(ownerDraft)}. The UI highlights this before the visitor signs anything.
            </p>
            <div className="owner-controls compact">
              <div>
                <span>Shared scope</span>
                <strong>{ownerDraft.useSharedPenalties ? ownerDraft.strikeScopeId : "isolated"}</strong>
              </div>
              <div>
                <span>Network policy</span>
                <strong>{ownerDraft.useSharedPenalties ? "enabled" : "disabled"}</strong>
              </div>
            </div>
          </div>

          {showFullDetail ? (
            <div className="preview-card neutral shared-policy-card">
              <p className="preview-pill">Strike network policy</p>
              <p className="preview-detail">
                Shared networks persist distrust across multiple lockers in the same owner-defined scope.
              </p>
              <div className="trade-grid">
                <label>
                  Scope ID
                  <input
                    type="number"
                    min={0}
                    value={sharedNetworkPolicyForm.scopeId}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? { ...current, scopeId: Math.max(0, Number(event.target.value) || 0) }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Pricing penalty / strike (bps)
                  <input
                    type="number"
                    min={0}
                    value={sharedNetworkPolicyForm.pricingPenaltyPerStrikeBps}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              pricingPenaltyPerStrikeBps: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Max pricing penalty (bps)
                  <input
                    type="number"
                    min={0}
                    value={sharedNetworkPolicyForm.maxPricingPenaltyBps}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              maxPricingPenaltyBps: Math.max(0, Number(event.target.value) || 0),
                            }
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
                    value={sharedNetworkPolicyForm.lockoutStrikeThreshold}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              lockoutStrikeThreshold: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Network lockout (ms)
                  <input
                    type="number"
                    min={0}
                    value={sharedNetworkPolicyForm.networkLockoutDurationMs}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current
                          ? {
                              ...current,
                              networkLockoutDurationMs: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
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
                    checked={sharedNetworkPolicyForm.isActive}
                    onChange={(event) =>
                      setSharedNetworkPolicyForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current,
                      )
                    }
                  />
                </label>
              </div>
              <div className="action-row">
                <button
                  className="secondary-action"
                  disabled={!runtime || snapshot.policy.isFrozen || !snapshot.owner.canEditSharedPenaltyPolicy || !ownerActor}
                  onClick={() => void handleSharedNetworkPolicySave()}
                >
                  Save strike network
                </button>
              </div>
            </div>
          ) : null}

          <div className="action-row">
            <button
              className="primary-action"
              disabled={
                !runtime ||
                snapshot.policy.isFrozen ||
                !ownerActor
              }
              onClick={() => void handlePolicySave()}
            >
              Save policy
            </button>
            <button
              className="secondary-action"
              disabled={
                !runtime ||
                snapshot.policy.isFrozen ||
                !ownerActor
              }
              onClick={() => void handleFreeze()}
            >
              Freeze locker
            </button>
          </div>
          {showFullDetail ? (
            <>
              <p className="support-copy">
                Owner actions use the owner character `{runtime?.ownerCharacterId ?? "n/a"}`. On
                localnet, this panel can use the local demo signer instead of a wallet extension. For
                Utopia/testnet, use a real wallet connection.
              </p>
              <p className="support-copy">
                Stocking inventory remains an operator setup action in v1. Use the local scripts for open-inventory and
                visitor-inventory seeding.
              </p>
            </>
          ) : null}
        </article>

        {showFullDetail ? (
        <article className="card signals-card">
          <p className="section-label">Recent Locker Signals</p>
          <ul className="signal-list">
            {snapshot.recentSignals.length === 0 ? (
              <li className="empty-state">No recent Trust Locker events are available.</li>
            ) : (
              snapshot.recentSignals.map((signal) => (
                <li key={`${signal.digest}-${signal.type}`}>
                  <strong>{signal.type}</strong>
                  <span>{signal.summary}</span>
                  <small>{signal.digest}</small>
                </li>
              ))
            )}
          </ul>
        </article>
        ) : null}

        <article className="card status-trace-card">
          <p className="section-label">Wallet Action Status</p>
          <p className={`action-status ${actionState.status}`}>{actionState.label}</p>
          <p className="support-copy">{actionState.message ?? "No wallet action has been attempted yet."}</p>
          {actionState.digest ? <p className="support-copy">Digest: {actionState.digest}</p> : null}
          {showFullDetail ? (
            <p className="support-copy">
              Current submission scope keeps Utopia as read-only validation. Localnet browser proof now
              uses an explicit local-only demo signer path when no suitable wallet extension exists for
              custom RPC development.
            </p>
          ) : null}
        </article>
      </section>
    </main>
  );
}

export default App;
