import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { LockerDataEnvelope, LockerIdentityState, UiCapabilities } from "./models";
import { TRUST_LOCKER_CATALOG, type LockerPolicyDraft } from "../trust-locker.config";

const { mockResolveLockerData } = vi.hoisted(() => ({
  mockResolveLockerData: vi.fn<(input: unknown) => Promise<LockerDataEnvelope>>(),
}));

vi.mock("./lockerDataProvider", () => ({
  resolveLockerData: mockResolveLockerData,
}));

vi.mock("@evefrontier/dapp-kit", () => ({
  abbreviateAddress: (value: string) => (value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "n/a"),
  getCharacterOwnedObjects: vi.fn().mockResolvedValue({}),
  getObjectsByType: vi.fn().mockResolvedValue({}),
  TENANT_CONFIG: {},
  useConnection: () => ({
    handleConnect: vi.fn(),
    handleDisconnect: vi.fn(),
  }),
  useSmartObject: () => ({
    assembly: {
      id: "locker-1",
      name: "Barter Box",
    },
    assemblyOwner: {
      id: "char-owner",
      name: "Owner Character",
      address: "0xowner",
    },
    loading: false,
    error: null,
  }),
}));

vi.mock("@mysten/dapp-kit-react", () => ({
  useCurrentAccount: () => ({ address: "0xwallet" }),
  useCurrentWallet: () => ({ name: "Browser Wallet" }),
  useDAppKit: () => ({
    signAndExecuteTransaction: vi.fn(),
  }),
}));

function buildPolicy(marketMode: LockerPolicyDraft["marketMode"] = "perpetual"): LockerPolicyDraft {
  return {
    acceptedItems: TRUST_LOCKER_CATALOG.slice(0, 2),
    friendlyTribes: [100],
    rivalTribes: [200],
    friendlyMultiplierBps: 9000,
    rivalMultiplierBps: 15000,
    marketMode,
    fuelFeeUnits: 0,
    cooldownMs: 60_000,
    strikeScopeId: 7,
    useSharedPenalties: false,
    isActive: true,
    isFrozen: false,
  };
}

function buildIdentity(overrides: Partial<LockerIdentityState> = {}): LockerIdentityState {
  return {
    assemblyOwnerCharacterId: "char-owner",
    resolvedWalletCharacters: [
      {
        id: "char-owner",
        address: "0xowner",
        name: "Owner Character",
        characterItemId: 5678,
        matchesOwner: true,
      },
      {
        id: "char-visitor",
        address: "0xvisitor",
        name: "Visitor Character",
        characterItemId: 1234,
        matchesOwner: false,
      },
    ],
    selectedWalletCharacterId: "char-owner",
    isCurrentCharacterOwner: true,
    characterResolutionStatus: "owner_selected",
    ...overrides,
  };
}

function buildCapabilities(overrides: Partial<UiCapabilities> = {}): UiCapabilities {
  return {
    showDemoSigner: false,
    showDiscovery: false,
    showSignals: false,
    showSupportCopy: false,
    showAdvancedOwnerControls: true,
    showLocalnetProofNotes: false,
    showActionStatusPanel: false,
    showVisitorWorkspace: true,
    showOwnerWorkspace: true,
    showGuidedFullFlow: false,
    showModeToggle: true,
    allowedViewModes: ["visitor", "owner", "full"],
    requestedViewMode: "visitor",
    effectiveViewMode: "visitor",
    ownerActionsEnabled: true,
    visitorActionsEnabled: true,
    ...overrides,
  };
}

function buildEnvelope(overrides: Partial<LockerDataEnvelope> = {}): LockerDataEnvelope {
  const policy = buildPolicy();
  return {
    snapshot: {
      lockerName: "Barter Box",
      lockerId: "locker-1",
      trustStatus: "mutable",
      fuelFeeSupported: false,
      owner: {
        label: "Owner Character",
        canEditPolicy: true,
        canFreezePolicy: true,
        canEditSharedPenaltyPolicy: true,
      },
      visitor: {
        relationshipBucket: "neutral",
        localStrikeCount: 0,
        localCooldownEndLabel: "No active cooldown",
        localCooldownActive: false,
        localCooldownEndTimestampMs: null,
      },
      sharedPenalty: {
        policy: {
          scopeId: 7,
          pricingPenaltyPerStrikeBps: 500,
          maxPricingPenaltyBps: 5000,
          lockoutStrikeThreshold: 3,
          networkLockoutDurationMs: 300000,
          isActive: false,
        },
        penalties: {
          strikeCount: 0,
          lastDeficitPoints: 0,
          networkCooldownEndTimestampMs: null,
          lastLockerId: "locker-1",
        },
        pricingPenaltyBps: 0,
        lockoutActive: false,
        lockoutEndLabel: "No network lockout",
      },
      openInventory: [{ ...TRUST_LOCKER_CATALOG[1], quantity: 5 }],
      ownerReserveInventory: [],
      ownerCargoInventory: [{ ...TRUST_LOCKER_CATALOG[0], quantity: 4 }],
      visitorInventory: [{ ...TRUST_LOCKER_CATALOG[0], quantity: 6 }],
      policy,
      recentSignals: [],
    },
    source: "utopia",
    notes: ["Hosted Utopia runtime resolved from explicit Cloudflare config and the selected smart object."],
    runtime: {
      network: "utopia",
      rpcUrl: "https://fullnode.testnet.sui.io",
      tenant: "utopia",
      lockerId: "locker-1",
      ownerCharacterId: "char-owner",
      visitorCharacterId: "char-visitor",
      extensionConfigId: "0xconfig",
      trustLockerPackageId: "0xpackage",
      worldPackageId: "0xworld",
      defaultViewMode: "visitor",
    },
    runtimeEnvironment: "utopia-browser",
    identity: buildIdentity(),
    capabilities: buildCapabilities(),
    ...overrides,
  };
}

describe("App identity and gating", () => {
  beforeEach(() => {
    mockResolveLockerData.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows explicit character-selection guidance when multiple characters need selection", async () => {
    mockResolveLockerData.mockResolvedValue(
      buildEnvelope({
        identity: buildIdentity({
          selectedWalletCharacterId: null,
          isCurrentCharacterOwner: false,
          characterResolutionStatus: "multiple_needs_selection",
        }),
        capabilities: buildCapabilities({
          requestedViewMode: "visitor",
          effectiveViewMode: "visitor",
          ownerActionsEnabled: false,
          visitorActionsEnabled: false,
        }),
      }),
    );

    render(<App />);

    expect(await screen.findByText("Character selection")).toBeTruthy();
    expect(
      screen.getByText(
        "Multiple wallet characters were found. Choose the one that should act on this unit before attempting live writes.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: /Owner Character \(Owner\)/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Visitor Character \(Visitor\)/ })).toBeTruthy();
    expect(
      screen.getByText("Multiple wallet characters were found. Choose one before attempting a visitor trade."),
    ).toBeTruthy();
  });

  it("hides admin and keeps owner navigation in-game for the onchain owner", async () => {
    mockResolveLockerData.mockResolvedValue(
      buildEnvelope({
        runtimeEnvironment: "utopia-in-game",
        identity: buildIdentity(),
        capabilities: buildCapabilities({
          allowedViewModes: ["visitor", "owner"],
          requestedViewMode: "owner",
          effectiveViewMode: "owner",
        }),
      }),
    );

    render(<App />);

    await screen.findByRole("button", { name: "Owner" });
    expect(screen.getByRole("button", { name: "Visitor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  });

  it("forces non-owners into visitor-only mode in-game", async () => {
    mockResolveLockerData.mockResolvedValue(
      buildEnvelope({
        runtimeEnvironment: "utopia-in-game",
        identity: buildIdentity({
          selectedWalletCharacterId: "char-visitor",
          isCurrentCharacterOwner: false,
          characterResolutionStatus: "visitor_selected",
        }),
        capabilities: buildCapabilities({
          allowedViewModes: ["visitor"],
          showModeToggle: false,
          requestedViewMode: "owner",
          effectiveViewMode: "visitor",
          ownerActionsEnabled: false,
        }),
      }),
    );

    render(<App />);

    await screen.findByText("Trade");
    expect(screen.queryAllByRole("button", { name: "Owner" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Admin" })).toHaveLength(0);
  });

  it("renders owner view as read-only for a non-owner in the browser", async () => {
    mockResolveLockerData.mockResolvedValue(
      buildEnvelope({
        identity: buildIdentity({
          selectedWalletCharacterId: "char-visitor",
          isCurrentCharacterOwner: false,
          characterResolutionStatus: "visitor_selected",
        }),
        capabilities: buildCapabilities({
          requestedViewMode: "owner",
          effectiveViewMode: "owner",
          ownerActionsEnabled: false,
        }),
      }),
    );

    render(<App />);

    expect(
      await screen.findAllByText("The selected character does not match the current onchain owner of this unit."),
    ).not.toHaveLength(0);
    await waitFor(() => {
      const fieldset = document.querySelector(".workspace-fieldset") as HTMLFieldSetElement | null;
      expect(fieldset).not.toBeNull();
      expect(fieldset?.disabled).toBe(true);
    });
  });

  it("shows the same-item trade block in the visitor flow", async () => {
    mockResolveLockerData.mockResolvedValue(
      buildEnvelope({
        snapshot: {
          ...buildEnvelope().snapshot,
          openInventory: [{ ...TRUST_LOCKER_CATALOG[0], quantity: 2 }],
          visitorInventory: [{ ...TRUST_LOCKER_CATALOG[0], quantity: 4 }],
          policy: {
            ...buildPolicy(),
            acceptedItems: [TRUST_LOCKER_CATALOG[0]],
          },
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText("Choose two different goods. Same-item trades are disabled.")).toBeTruthy();
  });
});
