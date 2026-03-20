import { getWalletCharacters, parseCharacterFromJson } from "@evefrontier/dapp-kit";
import { createDemoSnapshot } from "./demoData";
import { resolveLocalnetLockerSnapshot, resolveRuntimeSnapshot } from "./liveLocalnet";
import type {
  CharacterResolutionStatus,
  LockerDataEnvelope,
  LockerDataSource,
  LockerIdentityState,
  LockerSnapshot,
  RuntimeEnvironment,
  UiCapabilities,
  UiMode,
  WalletCharacterCandidate,
} from "./models";
import { buildHostedUtopiaRuntime, isLocalRuntimeHost, readHostedUtopiaConfig } from "./runtimeConfig";

type ProviderInput = {
  assemblyId?: string;
  assemblyName?: string;
  assemblyOwner?: {
    id?: string | null;
    name?: string | null;
    address?: string | null;
  } | null;
  smartObjectError?: string | null;
  walletAddress?: string | null;
  tenant?: string | null;
  viewMode: UiMode;
  selectedWalletCharacterId?: string | null;
  isInGameClient?: boolean;
};

function applyAssemblyContext(
  snapshot: LockerSnapshot,
  assemblyId?: string,
  assemblyName?: string,
  ownerLabel?: string,
): LockerSnapshot {
  return {
    ...snapshot,
    lockerId: assemblyId || snapshot.lockerId,
    lockerName: assemblyName || snapshot.lockerName,
    owner: ownerLabel
      ? {
          ...snapshot.owner,
          label: ownerLabel,
        }
      : snapshot.owner,
  };
}

function resolveRuntimeEnvironment(args: {
  tenant?: string | null;
  runtimeNetwork?: "localnet" | "utopia";
  isInGameClient?: boolean;
}): RuntimeEnvironment {
  if (args.runtimeNetwork === "localnet") return "localnet";
  if (args.tenant === "utopia" && args.isInGameClient) return "utopia-in-game";
  return "utopia-browser";
}

function deriveCharacterResolutionStatus(args: {
  selectedWalletCharacterId: string | null;
  resolvedWalletCharacters: WalletCharacterCandidate[];
  isCurrentCharacterOwner: boolean;
}): CharacterResolutionStatus {
  if (args.resolvedWalletCharacters.length === 0) return "none";
  if (args.resolvedWalletCharacters.length === 1) {
    return args.isCurrentCharacterOwner ? "owner_selected" : "single";
  }
  if (!args.selectedWalletCharacterId) return "multiple_needs_selection";
  return args.isCurrentCharacterOwner ? "owner_selected" : "visitor_selected";
}

async function resolveWalletCharacters(
  walletAddress?: string | null,
  assemblyOwnerCharacterId?: string | null,
): Promise<WalletCharacterCandidate[]> {
  if (!walletAddress) return [];
  const response = await getWalletCharacters(walletAddress);
  const nodes = response.data?.address?.objects?.nodes ?? [];
  const deduped = new Map<string, WalletCharacterCandidate>();

  for (const node of nodes) {
    const json = (node as { asMoveObject?: { contents?: { json?: Record<string, unknown> } | null } | null })
      ?.asMoveObject?.contents?.json;
    const character = parseCharacterFromJson(json);
    if (!character?.id) continue;

    deduped.set(character.id, {
      id: character.id,
      address: character.address,
      name: character.name || `Character ${character.characterId || character.id.slice(0, 6)}`,
      characterItemId: character.characterId,
      matchesOwner: Boolean(assemblyOwnerCharacterId && character.id === assemblyOwnerCharacterId),
    });
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

function resolveIdentityState(args: {
  assemblyOwnerCharacterId?: string | null;
  resolvedWalletCharacters: WalletCharacterCandidate[];
  selectedWalletCharacterId?: string | null;
}): LockerIdentityState {
  const assemblyOwnerCharacterId = args.assemblyOwnerCharacterId?.trim() ?? "";
  const selectedWalletCharacterId = args.resolvedWalletCharacters.some(
    (candidate) => candidate.id === args.selectedWalletCharacterId,
  )
    ? args.selectedWalletCharacterId ?? null
    : args.resolvedWalletCharacters.length === 1
      ? args.resolvedWalletCharacters[0]?.id ?? null
      : null;
  const isCurrentCharacterOwner = Boolean(
    selectedWalletCharacterId &&
      assemblyOwnerCharacterId &&
      selectedWalletCharacterId === assemblyOwnerCharacterId,
  );

  return {
    assemblyOwnerCharacterId,
    resolvedWalletCharacters: args.resolvedWalletCharacters,
    selectedWalletCharacterId,
    isCurrentCharacterOwner,
    characterResolutionStatus: deriveCharacterResolutionStatus({
      selectedWalletCharacterId,
      resolvedWalletCharacters: args.resolvedWalletCharacters,
      isCurrentCharacterOwner,
    }),
  };
}

function resolveUiCapabilities(
  runtimeEnvironment: RuntimeEnvironment,
  requestedViewMode: UiMode,
  identity: LockerIdentityState,
): UiCapabilities {
  const isLocalnet = runtimeEnvironment === "localnet";
  const isInGame = runtimeEnvironment === "utopia-in-game";
  const ownerActionsEnabled = isLocalnet || identity.isCurrentCharacterOwner;
  const visitorActionsEnabled =
    isLocalnet ||
    identity.characterResolutionStatus === "single" ||
    identity.characterResolutionStatus === "owner_selected" ||
    identity.characterResolutionStatus === "visitor_selected";

  let allowedViewModes: UiMode[];
  if (isLocalnet) {
    allowedViewModes = ["visitor", "owner", "full"];
  } else if (isInGame) {
    allowedViewModes = identity.isCurrentCharacterOwner ? ["visitor", "owner"] : ["visitor"];
  } else {
    allowedViewModes = ["visitor", "owner", "full"];
  }

  const fallbackViewMode =
    isInGame
      ? identity.isCurrentCharacterOwner
        ? "owner"
        : "visitor"
      : requestedViewMode === "full"
        ? "full"
        : requestedViewMode === "owner"
          ? "owner"
          : "visitor";
  const effectiveViewMode = allowedViewModes.includes(requestedViewMode)
    ? requestedViewMode
    : fallbackViewMode;
  const isFull = effectiveViewMode === "full";
  const isOwner = effectiveViewMode === "owner";
  const isVisitor = effectiveViewMode === "visitor";

  return {
    showDemoSigner: isFull && isLocalnet,
    showDiscovery: isFull,
    showSignals: isFull,
    showSupportCopy: isFull,
    showAdvancedOwnerControls: isFull || isOwner,
    showLocalnetProofNotes: isFull && isLocalnet,
    showActionStatusPanel: isFull,
    showVisitorWorkspace: isFull || isVisitor,
    showOwnerWorkspace: isFull || isOwner,
    showGuidedFullFlow: isFull,
    showModeToggle: allowedViewModes.length > 1,
    allowedViewModes,
    requestedViewMode,
    effectiveViewMode,
    ownerActionsEnabled,
    visitorActionsEnabled,
  };
}

export async function resolveLockerData(input: ProviderInput): Promise<LockerDataEnvelope> {
  let snapshot = createDemoSnapshot();
  const notes: string[] = [];
  let source: LockerDataSource = "demo";
  let runtime: LockerDataEnvelope["runtime"];
  const resolvedWalletCharacters = await resolveWalletCharacters(
    input.walletAddress,
    input.assemblyOwner?.id,
  );
  const identity = resolveIdentityState({
    assemblyOwnerCharacterId: input.assemblyOwner?.id,
    resolvedWalletCharacters,
    selectedWalletCharacterId: input.selectedWalletCharacterId,
  });
  let runtimeEnvironment = resolveRuntimeEnvironment({
    tenant: input.tenant,
    isInGameClient: input.isInGameClient,
  });
  const ownerLabel =
    input.assemblyOwner?.name?.trim() ||
    input.assemblyOwner?.address?.trim() ||
    snapshot.owner.label;

  if (input.assemblyId || input.assemblyName || ownerLabel) {
    snapshot = applyAssemblyContext(snapshot, input.assemblyId, input.assemblyName, ownerLabel);
    source = "assembly";
    notes.push("Assembly context detected.");
  }

  if (input.smartObjectError) {
    notes.push(`Smart object read warning: ${input.smartObjectError}`);
  }

  if (isLocalRuntimeHost() && !input.smartObjectError) {
    try {
      const localnet = await resolveLocalnetLockerSnapshot(
        input.assemblyId,
        input.assemblyName,
        input.walletAddress ?? undefined,
      );
      snapshot = applyAssemblyContext(
        localnet.snapshot,
        input.assemblyId,
        input.assemblyName,
        ownerLabel,
      );
      source = localnet.source;
      notes.push(...localnet.notes);
      runtime = localnet.runtime;
      runtimeEnvironment = resolveRuntimeEnvironment({
        tenant: input.tenant,
        runtimeNetwork: localnet.runtime?.network,
        isInGameClient: input.isInGameClient,
      });
    } catch (error) {
      notes.push(
        `Localnet read integration is unavailable. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (input.tenant === "utopia" && input.assemblyId && !input.smartObjectError) {
    const hostedConfig = readHostedUtopiaConfig();

    if (hostedConfig.missing.length > 0) {
      notes.push(
        `Hosted Utopia config is incomplete. Set ${hostedConfig.missing.join(", ")} in Cloudflare Pages before enabling live Barter Box reads and writes.`,
      );
    } else {
      try {
        const utopiaRuntime = buildHostedUtopiaRuntime({
          assemblyId: input.assemblyId,
          ownerCharacterId: identity.assemblyOwnerCharacterId,
          visitorCharacterId: identity.selectedWalletCharacterId,
          tenant: input.tenant,
          defaultViewMode: identity.isCurrentCharacterOwner ? "owner" : "visitor",
        });

        const utopia = await resolveRuntimeSnapshot({
          runtime: utopiaRuntime,
          senderAddress: input.walletAddress ?? undefined,
          assemblyName: input.assemblyName,
          ownerLabel,
          notesPrefix: "Hosted Utopia runtime resolved from explicit Cloudflare config and the selected smart object.",
        });

        snapshot = applyAssemblyContext(
          utopia.snapshot,
          input.assemblyId,
          input.assemblyName,
          ownerLabel,
        );
        source = "utopia";
        notes.push(...utopia.notes);
        runtime = utopia.runtime;
        runtimeEnvironment = resolveRuntimeEnvironment({
          tenant: input.tenant,
          runtimeNetwork: utopia.runtime.network,
          isInGameClient: input.isInGameClient,
        });
      } catch (error) {
        notes.push(
          `Hosted Utopia runtime could not resolve live Barter Box state. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } else if (input.tenant === "utopia" && !input.smartObjectError) {
    notes.push(
      "Hosted Utopia needs a real assembly itemId. Open this page from a live assembly or add ?tenant=utopia&itemId=<assembly item id> to the URL.",
    );
  } else if (!input.smartObjectError) {
    notes.push("No live runtime was selected, so the curated Barter Box snapshot remains active.");
  }

  if (input.walletAddress && identity.characterResolutionStatus === "multiple_needs_selection") {
    notes.push("Multiple wallet characters are available. Choose one before attempting live owner or visitor actions.");
  } else if (input.walletAddress && identity.characterResolutionStatus === "none") {
    notes.push("No live character was resolved for the connected wallet.");
  }

  return {
    snapshot,
    source,
    notes,
    runtime,
    runtimeEnvironment,
    identity,
    capabilities: resolveUiCapabilities(runtimeEnvironment, input.viewMode, identity),
  };
}
