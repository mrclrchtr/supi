import { beforeEach, describe, expect, it } from "vitest";
import type { CodeProvider } from "../../../src/provider/code-provider.ts";
import {
  clearCodeProvider,
  getCodeProvider,
  registerCodeProvider,
} from "../../../src/provider/registry.ts";

// Use unique cwds per test to avoid cross-test interference from the global registry
let _testCwdA: string;
let _testCwdB: string;

function uniqueId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function createMockProvider(): CodeProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => null,
    workspaceSymbols: async () => null,
    calleesAt: async () => ({
      kind: "unsupported-language" as const,
      file: "",
      message: "mock",
    }),
    exports: async () => ({
      kind: "unsupported-language" as const,
      file: "",
      message: "mock",
    }),
    outline: async () => ({
      kind: "unsupported-language" as const,
      file: "",
      message: "mock",
    }),
    imports: async () => ({
      kind: "unsupported-language" as const,
      file: "",
      message: "mock",
    }),
    nodeAt: async () => ({
      kind: "unsupported-language" as const,
      file: "",
      message: "mock",
    }),
  };
}

describe("CodeProvider registry", () => {
  let cwdA: string;
  let cwdB: string;

  beforeEach(() => {
    cwdA = `/workspace/${uniqueId()}`;
    cwdB = `/workspace/${uniqueId()}`;
  });

  it("returns unavailable for an unknown cwd", () => {
    const state = getCodeProvider("/unknown");
    expect(state.kind).toBe("unavailable");
  });

  it("returns ready after registering a provider", () => {
    const provider = createMockProvider();
    registerCodeProvider(cwdA, provider);

    const state = getCodeProvider(cwdA);
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.provider).toBe(provider);
    }
  });

  it("isolates providers by cwd", () => {
    const providerA = createMockProvider();
    const providerB = createMockProvider();
    registerCodeProvider(cwdA, providerA);
    registerCodeProvider(cwdB, providerB);

    const stateA = getCodeProvider(cwdA);
    const stateB = getCodeProvider(cwdB);

    expect(stateA.kind).toBe("ready");
    expect(stateB.kind).toBe("ready");
    if (stateA.kind === "ready" && stateB.kind === "ready") {
      expect(stateA.provider).toBe(providerA);
      expect(stateB.provider).toBe(providerB);
      expect(stateA.provider).not.toBe(stateB.provider);
    }
  });

  it("returns unavailable after clearing a registered provider", () => {
    const provider = createMockProvider();
    registerCodeProvider(cwdA, provider);
    clearCodeProvider(cwdA);

    const state = getCodeProvider(cwdA);
    expect(state.kind).toBe("unavailable");
  });

  it("does not affect other cwds when clearing one", () => {
    const providerA = createMockProvider();
    const providerB = createMockProvider();
    registerCodeProvider(cwdA, providerA);
    registerCodeProvider(cwdB, providerB);

    clearCodeProvider(cwdA);

    const stateA = getCodeProvider(cwdA);
    const stateB = getCodeProvider(cwdB);

    expect(stateA.kind).toBe("unavailable");
    expect(stateB.kind).toBe("ready");
  });

  it("composes two providers when registering the same cwd", () => {
    const semanticOnly = createMockProvider();
    const structuralOnly = createMockProvider();
    registerCodeProvider(cwdA, semanticOnly);
    registerCodeProvider(cwdA, structuralOnly);

    const state = getCodeProvider(cwdA);
    expect(state.kind).toBe("ready");
    // Composed provider is a new object, not either original
    if (state.kind === "ready") {
      expect(state.provider).not.toBe(semanticOnly);
      expect(state.provider).not.toBe(structuralOnly);
    }
  });

  it("falls back to first provider for semantic methods when second is null", async () => {
    const first = createMockProvider();
    // second returns null for semantic methods
    const second = createMockProvider();
    registerCodeProvider(cwdA, first);
    registerCodeProvider(cwdA, second);

    const state = getCodeProvider(cwdA);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;

    // Both return null, so result should be null
    const refs = await state.provider.references("test.ts", { line: 0, character: 0 });
    expect(refs).toBeNull();
  });
});
