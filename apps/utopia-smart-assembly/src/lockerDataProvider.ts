import { getWalletCharacters, parseCharacterFromJson } from "@evefrontier/dapp-kit";
import { createDemoSnapshot } from "./demoData";
import { resolveLocalnetLockerSnapshot, resolveRuntimeSnapshot } from "./liveLocalnet";
import type {
  LockerDataEnvelope,
  LockerDataSource,
  LockerSnapshot,
  RuntimeEnvironment,
  UiCapabilities,
  UiMode,
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
  viewMode: UiMode;
  runtimeNetwork?: "localnet" | "utopia";
}): RuntimeEnvironment {
  if (args.runtimeNetwork === "localnet") return "localnet";
  if (args.tenant === "utopia") {
    return args.viewMode === "visitor" ? "utopia-in-game" : "utopia-browser";
  }
  return args.viewMode === "visitor" ? "utopia-in-game" : "utopia-browser";
}

function resolveUiCapabilities(runtimeEnvironment: RuntimeEnvironment, viewMode: UiMode): UiCapabilities {
  const isFull = viewMode === "full";
  const isOwner = viewMode === "owner";
  const isVisitor = viewMode === "visitor";
  const isLocalnet = runtimeEnvironment === "localnet";

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
  };
}

async function resolveWalletCharacterId(walletAddress?: string | null): Promise<string | null> {
  if (!walletAddress) return null;
  const response = await getWalletCharacters(walletAddress);
  const node = response.data?.address?.objects?.nodes?.[0] as
    | { asMoveObject?: { contents?: { json?: Record<string, unknown> } | null } | null }
    | undefined;
  const json = node?.asMoveObject?.contents?.json;
  const character = parseCharacterFromJson(json);
  return character?.id || null;
}

export async function resolveLockerData(input: ProviderInput): Promise<LockerDataEnvelope> {
  let snapshot = createDemoSnapshot();
  const notes: string[] = [];
  let source: LockerDataSource = "demo";
  let runtime: LockerDataEnvelope["runtime"];
  let runtimeEnvironment = resolveRuntimeEnvironment({
    tenant: input.tenant,
    viewMode: input.viewMode,
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
        viewMode: input.viewMode,
        runtimeNetwork: localnet.runtime?.network,
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
        const visitorCharacterId = await resolveWalletCharacterId(input.walletAddress);
        const utopiaRuntime = buildHostedUtopiaRuntime({
          assemblyId: input.assemblyId,
          ownerCharacterId: input.assemblyOwner?.id,
          visitorCharacterId,
          tenant: input.tenant,
          defaultViewMode: "visitor",
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
          viewMode: input.viewMode,
          runtimeNetwork: utopia.runtime.network,
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
    notes.push("Hosted Utopia routing needs a real assembly itemId before live Barter Box state can be resolved.");
  } else if (!input.smartObjectError) {
    notes.push("No live runtime was selected, so the curated Barter Box snapshot remains active.");
  }

  return {
    snapshot,
    source,
    notes,
    runtime,
    runtimeEnvironment,
    capabilities: resolveUiCapabilities(runtimeEnvironment, input.viewMode),
  };
}
