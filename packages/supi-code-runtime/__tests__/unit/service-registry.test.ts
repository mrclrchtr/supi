import { describe, expect, it } from "vitest";
import type { ProviderAvailability } from "../../src/api.ts";
import { createSessionStateRegistry } from "../../src/api.ts";

describe("createSessionStateRegistry", () => {
  it("creates a registry with get/set/clear", () => {
    const registry = createSessionStateRegistry<string>("test-registry-1");
    expect(registry.get("key-1")).toBeUndefined();
    registry.set("key-1", "value-1");
    expect(registry.get("key-1")).toBe("value-1");
    registry.clear("key-1");
    expect(registry.get("key-1")).toBeUndefined();
  });

  it("works with ProviderAvailability state values", () => {
    const registry = createSessionStateRegistry<ProviderAvailability>("test-registry-2");
    registry.set("cwd-a", { kind: "pending" });
    expect(registry.get("cwd-a")?.kind).toBe("pending");

    registry.set("cwd-a", { kind: "ready" });
    expect(registry.get("cwd-a")?.kind).toBe("ready");

    registry.set("cwd-b", { kind: "unavailable", reason: "no server" });
    const state = registry.get("cwd-b");
    expect(state?.kind).toBe("unavailable");
    if (state?.kind === "unavailable") {
      expect(state.reason).toBe("no server");
    }
  });

  it("isolates values between different registries", () => {
    const regA = createSessionStateRegistry<string>("test-registry-3a");
    const regB = createSessionStateRegistry<string>("test-registry-3b");
    regA.set("shared-key", "value-a");
    regB.set("shared-key", "value-b");
    expect(regA.get("shared-key")).toBe("value-a");
    expect(regB.get("shared-key")).toBe("value-b");
  });
});
