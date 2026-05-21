import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionTreeSitterService,
  getSessionTreeSitterService,
  setSessionTreeSitterService,
} from "../src/session/service-registry.ts";
import type { TreeSitterService } from "../src/types.ts";

describe("tree-sitter session service registry", () => {
  beforeEach(() => {
    clearSessionTreeSitterService("/test");
    clearSessionTreeSitterService("/other");
    clearSessionTreeSitterService("/module-copy-test");
  });

  it("returns unavailable when no state is set", () => {
    const state = getSessionTreeSitterService("/test");
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("No Tree-sitter session initialized");
    }
  });

  it("returns ready state with a shared service", () => {
    const service = makeService();
    setSessionTreeSitterService("/test", service);

    const state = getSessionTreeSitterService("/test");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.service).toBe(service);
    }
  });

  it("isolates services by cwd", () => {
    setSessionTreeSitterService("/test", makeService());
    setSessionTreeSitterService("/other", makeService());

    expect(getSessionTreeSitterService("/test").kind).toBe("ready");
    expect(getSessionTreeSitterService("/other").kind).toBe("ready");
  });

  it("clears state for a specific cwd", () => {
    setSessionTreeSitterService("/test", makeService());
    clearSessionTreeSitterService("/test");
    expect(getSessionTreeSitterService("/test").kind).toBe("unavailable");
  });

  it("shares registry state across module instances", async () => {
    vi.resetModules();
    const first = await import("../src/session/service-registry.ts");
    first.setSessionTreeSitterService("/module-copy-test", makeService());

    vi.resetModules();
    const second = await import("../src/session/service-registry.ts");

    expect(second.getSessionTreeSitterService("/module-copy-test").kind).toBe("ready");
    second.clearSessionTreeSitterService("/module-copy-test");
  });
});

function makeService(): TreeSitterService {
  return {
    canParse: vi.fn(),
    query: vi.fn(),
    outline: vi.fn(),
    imports: vi.fn(),
    exports: vi.fn(),
    nodeAt: vi.fn(),
    calleesAt: vi.fn(),
  };
}
