import { getNetwork, logHeading, queryRecentTrustLockerEvents, readTrustLockerDeployment } from "./shared";
import { createClient } from "./shared";

const SIGNAL_TYPES = new Set([
    "TradeExecuted",
    "StrikeIssued",
    "CooldownUpdated",
    "PolicyUpdated",
    "LockerFrozen",
    "ItemWithdrawnEvent",
    "ItemDepositedEvent",
]);

function summarizeEventType(type?: string): string {
    if (!type) return "unknown";
    const short = type.split("::").pop() ?? type;
    return short;
}

function summarizeParsedJson(parsedJson: Record<string, unknown> | undefined): string {
    if (!parsedJson) return "";
    const trade = parsedJson as Record<string, unknown>;
    const locker = trade.locker_id ? String(trade.locker_id) : undefined;
    const visitor = trade.visitor_character_id ? String(trade.visitor_character_id) : undefined;
    const typeId = trade.requested_type_id ?? trade.type_id;
    const qty = trade.requested_quantity ?? trade.quantity;
    const deficit = trade.deficit_points;
    const strike = trade.strike_count;
    const cooldown = trade.cooldown_end_timestamp_ms;

    const parts: string[] = [];
    if (locker) parts.push(`locker=${locker}`);
    if (visitor) parts.push(`visitor=${visitor}`);
    if (typeId !== undefined) parts.push(`type_id=${String(typeId)}`);
    if (qty !== undefined) parts.push(`qty=${String(qty)}`);
    if (deficit !== undefined) parts.push(`deficit=${String(deficit)}`);
    if (strike !== undefined) parts.push(`strikes=${String(strike)}`);
    if (cooldown !== undefined) parts.push(`cooldown=${String(cooldown)}`);
    return parts.join(" ");
}

async function main() {
    const network = getNetwork();
    logHeading(`Barter Box Recent Signals (${network})`);

    const deployment = readTrustLockerDeployment(network);
    const client = createClient(network);
    const limit = Number(process.env.LOCKER_EVENT_LIMIT ?? 12);
    const events = await queryRecentTrustLockerEvents({
        client,
        packageId: deployment.trustLocker.packageId,
        limit,
    });

    const relevant = events.filter((event) => {
        const shortType = summarizeEventType(event.type);
        return SIGNAL_TYPES.has(shortType);
    });

    console.log("Package:", deployment.trustLocker.packageId);
    console.log("Module:", "trust_locker");
    console.log("Requested limit:", limit);
    console.log("Relevant events found:", relevant.length);
    for (const event of relevant) {
        const shortType = summarizeEventType(event.type);
        console.log(
            `- ${shortType} | tx=${event.id?.txDigest ?? "unknown"} | seq=${event.id?.eventSeq ?? "?"} | ${summarizeParsedJson(event.parsedJson)}`
        );
    }
}

main().catch((error) => {
    console.error("Failed to read Barter Box recent signals:", error);
    process.exit(1);
});
