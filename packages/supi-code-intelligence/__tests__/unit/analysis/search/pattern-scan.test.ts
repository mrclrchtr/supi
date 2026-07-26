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

function outlineProvider(
  resultForFile: (file: string) => ReturnType<StructuralProvider["outline"]>,
): StructuralProvider {
  return { outline: resultForFile } as StructuralProvider;
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

  it("excludes operation-ineligible languages without making a mixed scan partial", async () => {
    source("src/a.ts");
    source("src/b.py");
    const analyzedFiles: string[] = [];
    const provider = outlineProvider(async (file) => {
      analyzedFiles.push(file);
      return { kind: "success", data: [] };
    });

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
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
          exclusions: [{ reason: "unsupported-operation", pathCount: 1, examples: ["src/b.py"] }],
          limitations: [],
        },
      },
    });
  });

  it("returns unavailable when a directory contains only operation-ineligible files", async () => {
    source("python/a.py");
    const outline = vi.fn(async () => ({ kind: "success" as const, data: [] }));

    const outcome = await getStructuredPatternMatches({
      params: { pattern: "missing", kind: "definition" },
      roots: [path.join(tmpDir, "python")],
      cwd: tmpDir,
      structural: { outline } as unknown as StructuralProvider,
    });

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "No file in the requested scope supports AST definition search.",
    });
    expect(outline).not.toHaveBeenCalled();
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
