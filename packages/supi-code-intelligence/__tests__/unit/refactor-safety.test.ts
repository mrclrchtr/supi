import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";

describe("code_refactor safety", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
  });

  describe("validateEdit", () => {
    it("passes validation for a non-empty precise edit", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/index.ts",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
            newText: "newName",
          },
        ],
      });
      expect(result.safe).toBe(true);
    });

    it("rejects an empty edit set", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({ edits: [] });
      expect(result.safe).toBe(false);
      if (!result.safe) expect(result.reason).toBeTruthy();
    });

    it("rejects edits with invalid range (negative line)", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/index.ts",
            range: { start: { line: -1, character: 0 }, end: { line: 5, character: 0 } },
            newText: "foo",
          },
        ],
      });
      expect(result.safe).toBe(false);
    });

    it("rejects character positions beyond the actual file contents", async () => {
      const { validateEditAgainstFiles } = await import("../../src/analysis/refactor/safety.ts");
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "refactor-safety-"));
      const file = path.join(tmpDir, "index.ts");
      writeFileSync(file, "abc\n", "utf-8");

      try {
        const result = validateEditAgainstFiles({
          edits: [
            {
              file,
              range: { start: { line: 0, character: 99 }, end: { line: 0, character: 99 } },
              newText: "x",
            },
          ],
        });
        expect(result.safe).toBe(false);
        if (!result.safe) expect(result.reason).toContain("character 99");
        expect(readFileSync(file, "utf-8")).toBe("abc\n");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("end-before-start detection", () => {
    it("rejects edit where end line is before start line", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 10, character: 0 }, end: { line: 5, character: 0 } },
            newText: "x",
          },
        ],
      });
      expect(result.safe).toBe(false);
      if (!result.safe) expect(result.reason).toContain("end before start");
    });

    it("rejects edit where end character is before start character on same line", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 5, character: 10 }, end: { line: 5, character: 5 } },
            newText: "x",
          },
        ],
      });
      expect(result.safe).toBe(false);
    });
  });

  describe("overlapping range detection", () => {
    it("rejects overlapping edits on the same file", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
            newText: "foo",
          },
          {
            file: "/src/a.ts",
            range: { start: { line: 5, character: 5 }, end: { line: 5, character: 15 } },
            newText: "bar",
          },
        ],
      });
      expect(result.safe).toBe(false);
      if (!result.safe) expect(result.reason).toContain("Overlapping");
    });

    it("passes adjacent edits on same file (end equals next start)", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 5 } },
            newText: "hello",
          },
          {
            file: "/src/a.ts",
            range: { start: { line: 5, character: 5 }, end: { line: 5, character: 10 } },
            newText: "world",
          },
        ],
      });
      expect(result.safe).toBe(true);
    });

    it("passes non-overlapping edits on different files", async () => {
      const { validateEdit } = await import("../../src/analysis/refactor/safety.ts");
      const result = validateEdit({
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
            newText: "x",
          },
          {
            file: "/src/b.ts",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
            newText: "y",
          },
        ],
      });
      expect(result.safe).toBe(true);
    });
  });

  describe("planner route for code_refactor_plan", () => {
    it("routes code_refactor_plan to semantic-preferred when refactorAvailable is true", async () => {
      const runtime = getDefaultWorkspaceRuntime();
      const provider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        rename: async () => ({ kind: "precise" as const, edits: { edits: [] } }),
      };
      runtime.registerSemantic("/project", provider);

      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", "code_refactor_plan");
      expect(route.refactorAvailable).toBe(true);
      expect(route.preferred).toBe("semantic");
    });

    it("routes code_refactor_plan to unavailable when no semantic refactor is available", async () => {
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", "code_refactor_plan");
      expect(route.preferred).toBe("unavailable");
    });
  });
});
