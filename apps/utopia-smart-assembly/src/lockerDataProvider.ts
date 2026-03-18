import { createDemoSnapshot } from "./demoData";
import { resolveLocalnetLockerSnapshot } from "./liveLocalnet";
import type { LockerDataEnvelope, LockerDataSource, LockerSnapshot } from "./models";

type ProviderInput = {
  assemblyId?: string;
  assemblyName?: string;
  smartObjectError?: string | null;
  walletAddress?: string | null;
};

function applyAssemblyContext(
  snapshot: LockerSnapshot,
  assemblyId?: string,
  assemblyName?: string,
): LockerSnapshot {
  if (!assemblyId && !assemblyName) return snapshot;
  return {
    ...snapshot,
    lockerId: assemblyId || snapshot.lockerId,
    lockerName: assemblyName || snapshot.lockerName,
  };
}

function makeEnvelope(
  snapshot: LockerSnapshot,
  source: LockerDataSource,
  notes: string[],
): LockerDataEnvelope {
  return { snapshot, source, notes };
}

export async function resolveLockerData(input: ProviderInput): Promise<LockerDataEnvelope> {
  let snapshot = createDemoSnapshot();
  const notes: string[] = [];
  let source: LockerDataSource = "demo";
  let runtime: LockerDataEnvelope["runtime"];

  if (input.assemblyId || input.assemblyName) {
    snapshot = applyAssemblyContext(snapshot, input.assemblyId, input.assemblyName);
    source = "assembly";
    notes.push("Smart object context detected; locker identity mapped from selected assembly.");
  }

  if (!input.smartObjectError) {
    try {
      const localnet = await resolveLocalnetLockerSnapshot(
        input.assemblyId,
        input.assemblyName,
        input.walletAddress ?? undefined,
      );
      snapshot = localnet.snapshot;
      source = localnet.source;
      notes.push(...localnet.notes);
      runtime = localnet.runtime;
    } catch (error) {
      notes.push(
        `Localnet read integration not available; demo fallback remains active. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else {
    notes.push("Smart object read warning kept the app on the curated demo snapshot.");
  }

  if (input.smartObjectError) {
    notes.push(`Smart object read warning: ${input.smartObjectError}`);
  }

  return {
    snapshot,
    source,
    notes,
    runtime,
  };
}
