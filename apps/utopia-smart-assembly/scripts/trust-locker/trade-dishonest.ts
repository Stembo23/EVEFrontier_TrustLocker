import { runTrade } from "./trade-common";

runTrade("dishonest").catch((error) => {
    console.error("Failed to run dishonest trade:", error);
    process.exit(1);
});
