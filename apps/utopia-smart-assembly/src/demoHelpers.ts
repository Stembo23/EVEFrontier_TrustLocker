import { DEFAULT_LOCKER_POLICY, TRUST_LOCKER_CATALOG } from "../trust-locker.config";

export function findDefaultCatalogEntry(typeId: number) {
  const item = TRUST_LOCKER_CATALOG.find((candidate) => candidate.typeId === typeId);
  if (!item) {
    throw new Error(`Missing catalog item for type_id ${typeId}`);
  }
  return item;
}

export { DEFAULT_LOCKER_POLICY, TRUST_LOCKER_CATALOG };
