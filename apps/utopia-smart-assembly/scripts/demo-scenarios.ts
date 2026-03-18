import { DEFAULT_LOCKER_POLICY, TRUST_LOCKER_CATALOG } from "../trust-locker.config";

const lines = [
  "Trust Locker demo scenarios",
  "===========================",
  "1. Fair locker",
  "   Owner seeds a frozen locker with baseline industrial items and a neutral point table.",
  "2. Rival pricing",
  `   Rival visitors pay ${DEFAULT_LOCKER_POLICY.rivalMultiplierBps / 100}% of baseline request points.`,
  "3. Dishonest trade",
  "   Visitor underpays, receives the requested item, and immediately receives strike + cooldown.",
  "4. Predatory locker",
  "   Owner publishes extreme points or rival multipliers, and the UI surfaces that policy before use.",
  "5. Catalog scope",
  `   MVP accepts ${TRUST_LOCKER_CATALOG.length} curated type_ids, not the whole economy.`,
];

console.log(lines.join("\n"));
