import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionStateRegistry } from "../../src/registry-utils.ts";

describe("createSessionStateRegistry", () => {
  const registryName = "session-state-registry-test";

  beforeEach(() => {
    const registry = createSessionStateRegistry<string>(registryName);
    registry.clear("/test");
    registry.clear("/other");
    registry.clear("/tmp/project");
    registry.clear("/module-copy-test");
  });

  it("stores and retrieves state by cwd", () => {
    const registry = createSessionStateRegistry<string>(registryName);

    registry.set("/test", "ready");

    expect(registry.get("/test")).toBe("ready");
  });

  it("normalizes cwd aliases", () => {
    const registry = createSessionStateRegistry<string>(registryName);

    registry.set("/tmp/project/../project", "normalized");

    expect(registry.get("/tmp/project")).toBe("normalized");
  });

  it("clears one cwd without affecting another", () => {
    const registry = createSessionStateRegistry<string>(registryName);

    registry.set("/test", "keep");
    registry.set("/other", "clear-me");
    registry.clear("/other");

    expect(registry.get("/test")).toBe("keep");
    expect(registry.get("/other")).toBeUndefined();
  });

  it("shares state across module reloads", async () => {
    vi.resetModules();
    const first = await import("../../src/registry-utils.ts");
    first
      .createSessionStateRegistry<string>(registryName)
      .set("/module-copy-test", "shared-across-copies");

    vi.resetModules();
    const second = await import("../../src/registry-utils.ts");
    const reloadedRegistry = second.createSessionStateRegistry<string>(registryName);

    expect(reloadedRegistry.get("/module-copy-test")).toBe("shared-across-copies");
    reloadedRegistry.clear("/module-copy-test");
  });
});
