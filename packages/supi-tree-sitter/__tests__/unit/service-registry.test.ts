import { describe, expect, it } from "vitest";
import {
  clearSessionTreeSitterService,
  getSessionTreeSitterService,
  setSessionTreeSitterService,
} from "../../src/session/service-registry.ts";

describe("TreeSitter service registry", () => {
  it("starts unavailable for unknown cwd", () => {
    const state = getSessionTreeSitterService("/unknown");
    expect(state.kind).toBe("unavailable");
  });

  it("reports ready after service is set", () => {
    const mockService = {
      canParse: async () => ({
        kind: "success" as const,
        data: { file: "", language: "typescript" },
      }),
      query: async () => ({ kind: "success" as const, data: [] }),
      outline: async () => ({ kind: "success" as const, data: [] }),
      imports: async () => ({ kind: "success" as const, data: [] }),
      exports: async () => ({ kind: "success" as const, data: [] }),
      nodeAt: async () => ({
        kind: "success" as const,
        data: {
          type: "",
          range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
          text: "",
          ancestry: [],
        },
      }),
      calleesAt: async () => ({
        kind: "success" as const,
        data: {
          enclosingScope: {
            name: "",
            range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
          },
          callees: [],
        },
      }),
      callSites: async () => ({ kind: "success" as const, data: [] }),
    };

    setSessionTreeSitterService("/project", mockService);
    const state = getSessionTreeSitterService("/project");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.service).toBe(mockService);
    }
    clearSessionTreeSitterService("/project");
    const afterClear = getSessionTreeSitterService("/project");
    expect(afterClear.kind).toBe("unavailable");
  });

  it("isolates values between different cwds", () => {
    const mockTemplate = (): import("../../src/types.ts").SessionTreeSitterService => ({
      canParse: async () => ({
        kind: "success" as const,
        data: { file: "", language: "typescript" },
      }),
      query: async () => ({ kind: "success" as const, data: [] }),
      outline: async () => ({ kind: "success" as const, data: [] }),
      imports: async () => ({ kind: "success" as const, data: [] }),
      exports: async () => ({ kind: "success" as const, data: [] }),
      nodeAt: async () => ({
        kind: "success" as const,
        data: {
          type: "",
          range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
          text: "",
          ancestry: [],
        },
      }),
      calleesAt: async () => ({
        kind: "success" as const,
        data: {
          enclosingScope: {
            name: "",
            range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
          },
          callees: [],
        },
      }),
      callSites: async () => ({ kind: "success" as const, data: [] }),
    });

    const mockA = mockTemplate();
    const mockB = mockTemplate();

    setSessionTreeSitterService("/proj-a", mockA);
    setSessionTreeSitterService("/proj-b", mockB);

    const stateA = getSessionTreeSitterService("/proj-a");
    const stateB = getSessionTreeSitterService("/proj-b");

    expect(stateA.kind).toBe("ready");
    expect(stateB.kind).toBe("ready");
    if (stateA.kind === "ready" && stateB.kind === "ready") {
      expect(stateA.service).toBe(mockA);
      expect(stateB.service).toBe(mockB);
    }

    clearSessionTreeSitterService("/proj-a");
    clearSessionTreeSitterService("/proj-b");
  });
});
