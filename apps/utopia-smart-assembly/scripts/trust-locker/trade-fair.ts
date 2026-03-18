import { runTrade } from "./trade-common";

runTrade("fair").catch((error) => {
    console.error("Failed to run fair trade:", error);
    process.exit(1);
});
