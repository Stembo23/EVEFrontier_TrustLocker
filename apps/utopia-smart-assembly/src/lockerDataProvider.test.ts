import { describe, expect, it, vi } from "vitest";

vi.mock("@evefrontier/dapp-kit", () => ({
  getWalletCharacters: vi.fn(),
  parseCharacterFromJson: vi.fn(),
}));

import { resolveIdentityState, resolveUiCapabilities } from "./lockerDataProvider";
import type { WalletCharacterCandidate } from "./models";

function buildCandidate(
  id: string,
  name: string,
  matchesOwner = false,
): WalletCharacterCandidate {
  return {
    id,
    address: `0x${id.slice(-4)}`,
    name,
    characterItemId: Number(id.replace(/\D/g, "").slice(0, 4) || "1"),
    matchesOwner,
  };
}

describe("resolveIdentityState", () => {
  it("auto-selects a single resolved character", () => {
    const identity = resolveIdentityState({
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [buildCandidate("char-owner", "Owner", true)],
      selectedWalletCharacterId: null,
    });

    expect(identity.selectedWalletCharacterId).toBe("char-owner");
    expect(identity.isCurrentCharacterOwner).toBe(true);
    expect(identity.characterResolutionStatus).toBe("owner_selected");
  });

  it("does not guess when multiple characters are available", () => {
    const identity = resolveIdentityState({
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [
        buildCandidate("char-owner", "Owner", true),
        buildCandidate("char-visitor", "Visitor"),
      ],
      selectedWalletCharacterId: null,
    });

    expect(identity.selectedWalletCharacterId).toBeNull();
    expect(identity.isCurrentCharacterOwner).toBe(false);
    expect(identity.characterResolutionStatus).toBe("multiple_needs_selection");
  });

  it("preserves an explicit non-owner selection", () => {
    const identity = resolveIdentityState({
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [
        buildCandidate("char-owner", "Owner", true),
        buildCandidate("char-visitor", "Visitor"),
      ],
      selectedWalletCharacterId: "char-visitor",
    });

    expect(identity.selectedWalletCharacterId).toBe("char-visitor");
    expect(identity.isCurrentCharacterOwner).toBe(false);
    expect(identity.characterResolutionStatus).toBe("visitor_selected");
  });
});

describe("resolveUiCapabilities", () => {
  it("defaults in-game owners into owner mode and hides admin", () => {
    const capabilities = resolveUiCapabilities("utopia-in-game", "full", {
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [buildCandidate("char-owner", "Owner", true)],
      selectedWalletCharacterId: "char-owner",
      isCurrentCharacterOwner: true,
      characterResolutionStatus: "owner_selected",
    });

    expect(capabilities.allowedViewModes).toEqual(["visitor", "owner"]);
    expect(capabilities.effectiveViewMode).toBe("owner");
    expect(capabilities.showModeToggle).toBe(true);
    expect(capabilities.ownerActionsEnabled).toBe(true);
  });

  it("forces in-game non-owners into visitor-only mode", () => {
    const capabilities = resolveUiCapabilities("utopia-in-game", "owner", {
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [buildCandidate("char-visitor", "Visitor")],
      selectedWalletCharacterId: "char-visitor",
      isCurrentCharacterOwner: false,
      characterResolutionStatus: "single",
    });

    expect(capabilities.allowedViewModes).toEqual(["visitor"]);
    expect(capabilities.effectiveViewMode).toBe("visitor");
    expect(capabilities.showModeToggle).toBe(false);
    expect(capabilities.ownerActionsEnabled).toBe(false);
    expect(capabilities.visitorActionsEnabled).toBe(true);
  });

  it("keeps admin available in the external browser", () => {
    const capabilities = resolveUiCapabilities("utopia-browser", "full", {
      assemblyOwnerCharacterId: "char-owner",
      resolvedWalletCharacters: [buildCandidate("char-visitor", "Visitor")],
      selectedWalletCharacterId: "char-visitor",
      isCurrentCharacterOwner: false,
      characterResolutionStatus: "single",
    });

    expect(capabilities.allowedViewModes).toEqual(["visitor", "owner", "full"]);
    expect(capabilities.effectiveViewMode).toBe("full");
    expect(capabilities.showDiscovery).toBe(true);
    expect(capabilities.showModeToggle).toBe(true);
  });
});
