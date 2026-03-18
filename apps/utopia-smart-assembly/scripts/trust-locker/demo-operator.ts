import { spawnSync } from "node:child_process";

type DemoStage = "reset" | "prepare" | "verify" | "all";

const stage = (process.argv[2] ?? "all") as DemoStage;
const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

function run(script: string) {
  if (dryRun) {
    console.log(`pnpm run ${script}`);
    return;
  }
  console.log(`\n> pnpm ${script}`);
  const result = spawnSync("pnpm", ["run", script], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runMany(scripts: string[]) {
  if (dryRun) {
    console.log(`Demo stage: ${stage}`);
  }
  for (const script of scripts) {
    run(script);
  }
}

switch (stage) {
  case "reset":
    runMany(["print:locker-context", "locker:read-deployment"]);
    break;
  case "prepare":
    runMany([
      "locker:publish",
      "locker:authorize",
      "locker:configure",
      "locker:seed-open",
      "locker:seed-visitor",
    ]);
    break;
  case "verify":
    runMany([
      "locker:set-visitor-rival",
      "locker:trade-fair",
      "locker:trade-dishonest",
      "locker:inspect",
      "locker:signals",
      "demo:script",
    ]);
    break;
  case "all":
    runMany([
      "locker:read-deployment",
      "locker:publish",
      "locker:authorize",
      "locker:configure",
      "locker:seed-open",
      "locker:seed-visitor",
      "locker:trade-fair",
      "locker:set-visitor-rival",
      "locker:trade-dishonest",
      "locker:inspect",
      "locker:signals",
      "demo:script",
    ]);
    break;
  default:
    console.error(`Unknown demo stage: ${stage}`);
    process.exit(1);
}
