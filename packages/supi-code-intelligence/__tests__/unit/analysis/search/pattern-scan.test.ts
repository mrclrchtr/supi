import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStructuredPatternMatches } from "../../../../src/analysis/search/pattern.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "pattern-scan-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmpDir, { recursive: true, force: true });
});

function source(relativePath: string): void {
  const file = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "export const target = true;\n");
}

function outlineProvider(resultForFile: StructuralProvider["outline"]): StructuralProvider {
  return { outline: resultForFile } as StructuralProvider;
}

function importsProvider(resultForFile: StructuralProvider["imports"]): StructuralProvider {
  return { imports: resultForFile } as StructuralProvider;
}

describe("structured pattern AST Scan", () => {
  it("reports exact totals without an rg executable after a complete scan", async () => {
    vi.stubEnv("PATH", "");
    source("src/a.ts");
    source("src/b.ts");
    const provider = outlineProvider(async (file) => ({
      kind: "success",
      data: [
        {
          name: file.endsWith("a.ts") ? "targetA" : "other",
          kind: "variable",
          startLine: 1,
          startCharacter: 14,
          endLine: 1,
          endCharacter: 20,
          children: [],
        },
      ],
    }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "target", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        partialReason: null,
        matches: [{ file: "src/a.ts", name: "targetA", kind: "variable", line: 1 }],
        scan: {
          universe: "structural-operation-supported-files",
          roots: ["src"],
          policy: {
            operation: "outline",
            hiddenEntries: "excluded",
            ignoreFiles: false,
            symlinks: "explicit-roots-only",
            maxFiles: 5_000,
            timeoutMs: 10_000,
          },
          eligibleFileCount: 2,
          analyzedFileCount: 2,
          complete: true,
          limitations: [],
        },
      },
    });
  });

  it("matches structural polyglot declarations as AST types", async () => {
    source("src/model.go");
    const provider = outlineProvider(async () => ({
      kind: "success",
      data: [
        {
          name: "Model",
          kind: "struct",
          startLine: 2,
          startCharacter: 1,
          endLine: 2,
          endCharacter: 20,
          children: [],
        },
        {
          name: "Value",
          kind: "union",
          startLine: 3,
          startCharacter: 1,
          endLine: 3,
          endCharacter: 20,
          children: [],
        },
        {
          name: "RecordValue",
          kind: "record",
          startLine: 4,
          startCharacter: 1,
          endLine: 4,
          endCharacter: 20,
          children: [],
        },
        {
          name: "ObjectValue",
          kind: "object",
          startLine: 5,
          startCharacter: 1,
          endLine: 5,
          endCharacter: 20,
          children: [],
        },
        {
          name: "ConceptValue",
          kind: "concept",
          startLine: 6,
          startCharacter: 1,
          endLine: 6,
          endCharacter: 20,
          children: [],
        },
      ],
    }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "e", kind: "type" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        matches: [
          { file: "src/model.go", name: "Model", kind: "struct", line: 2 },
          { file: "src/model.go", name: "Value", kind: "union", line: 3 },
          { file: "src/model.go", name: "RecordValue", kind: "record", line: 4 },
          { file: "src/model.go", name: "ObjectValue", kind: "object", line: 5 },
          { file: "src/model.go", name: "ConceptValue", kind: "concept", line: 6 },
        ],
      },
    });
  });

  it("excludes operation-ineligible languages without making a mixed scan partial", async () => {
    source("src/a.ts");
    source("src/b.sql");
    const analyzedFiles: string[] = [];
    const provider = importsProvider(async (file) => {
      analyzedFiles.push(file);
      return { kind: "success", data: [] };
    });

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "import" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
    });

    expect(analyzedFiles).toEqual(["src/a.ts"]);
    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        partialReason: null,
        scan: {
          eligibleFileCount: 1,
          analyzedFileCount: 1,
          complete: true,
          exclusions: [{ reason: "unsupported-operation", pathCount: 1, examples: ["src/b.sql"] }],
          limitations: [],
        },
      },
    });
  });

  it("returns unavailable when a directory contains only operation-ineligible files", async () => {
    source("sql/query.sql");
    const imports = vi.fn(async () => ({ kind: "success" as const, data: [] }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "import" },
      roots: [path.join(tmpDir, "sql")],
      cwd: tmpDir,
      structural: { imports } as unknown as StructuralProvider,
    });

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "No file in the requested scope supports AST import search.",
    });
    expect(imports).not.toHaveBeenCalled();
  });

  it("rejects a provider capability mismatch instead of falling back", async () => {
    source("src/a.ts");
    const provider = outlineProvider(async (file) => ({
      kind: "unsupported-language",
      file,
      message: "outline unexpectedly unsupported",
    }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
    });

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Structural provider rejected 1 file declared eligible for outline analysis.",
    });
  });

  it("makes structural-provider failures partial instead of claiming absence", async () => {
    source("src/a.ts");
    source("src/b.ts");
    const provider = outlineProvider(async (file) =>
      file.endsWith("b.ts")
        ? { kind: "unavailable", message: "parser failed", file }
        : { kind: "success", data: [] },
    );

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        matches: [],
        partialReason: "provider-limited",
        failures: [{ file: "src/b.ts", kind: "unavailable", reason: "parser failed" }],
        scan: {
          eligibleFileCount: 2,
          analyzedFileCount: 1,
          complete: false,
          limitations: [
            {
              reason: "provider-failure",
              pathCount: 1,
              examples: ["src/b.ts"],
            },
          ],
        },
      },
    });
  });

  it("keeps omitted files separate from match evidence at the safety cap", async () => {
    source("src/a.ts");
    source("src/b.ts");
    const provider = outlineProvider(async () => ({ kind: "success", data: [] }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
      control: { maxFiles: 1 },
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        matches: [],
        partialReason: "safety-limit",
        scan: {
          eligibleFileCount: null,
          analyzedFileCount: 1,
          complete: false,
          limitations: [expect.objectContaining({ reason: "safety-limit", pathCount: null })],
        },
      },
    });
  });

  it("uses the earlier caller deadline as the shared structural deadline", async () => {
    source("src/a.ts");
    const controls: unknown[] = [];
    const provider = outlineProvider(async (_file, control) => {
      controls.push(control);
      return { kind: "success", data: [] };
    });

    await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
      control: { deadline: 8, timeoutMs: 10, now: () => 5 },
    });

    expect(controls[0]).toEqual({ signal: undefined, deadline: 8 });
  });

  it("forwards one exact signal and shared deadline to structural work", async () => {
    source("src/a.ts");
    source("src/b.ts");
    const controls: unknown[] = [];
    const provider = outlineProvider(async (_file, control) => {
      controls.push(control);
      return { kind: "success", data: [] };
    });
    const signal = new AbortController().signal;

    await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
      control: { signal, timeoutMs: 10, now: () => 5 },
    });

    expect(controls).toHaveLength(2);
    expect(controls[0]).toBe(controls[1]);
    expect(controls[0]).toEqual({ signal, deadline: 15 });
  });

  it("stops structural analysis between files on user cancellation", async () => {
    source("src/a.ts");
    source("src/b.ts");
    const controller = new AbortController();
    const cancellation = new Error("cancelled between files");
    const provider = outlineProvider(
      vi.fn(async () => {
        controller.abort(cancellation);
        return { kind: "success" as const, data: [] };
      }),
    );

    await expect(
      getStructuredPatternMatches({
        params: { pattern: "missing", kind: "definition" },
        roots: [path.join(tmpDir, "src")],
        cwd: tmpDir,
        structural: provider,
        control: { signal: controller.signal },
      }),
    ).rejects.toBe(cancellation);
    expect(provider.outline).toHaveBeenCalledOnce();
  });

  it("makes a deterministic analysis deadline partial", async () => {
    source("src/a.ts");
    source("src/b.ts");
    let expired = false;
    const provider = outlineProvider(async () => {
      expired = true;
      return { kind: "success", data: [] };
    });

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "src")],
      cwd: tmpDir,
      structural: provider,
      control: { timeoutMs: 10, now: () => (expired ? 11 : 0) },
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        partialReason: "timeout",
        scan: {
          eligibleFileCount: 2,
          analyzedFileCount: 0,
          complete: false,
          limitations: [expect.objectContaining({ reason: "timeout", pathCount: 2 })],
        },
      },
    });
  });
});
