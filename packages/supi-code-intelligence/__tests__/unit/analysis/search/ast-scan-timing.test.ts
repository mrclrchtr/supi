import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStructuredPatternMatches } from "../../../../src/analysis/search/pattern.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "ast-scan-timing-"));
  configureDebugRegistry({ enabled: true, maxEvents: 20 });
});

afterEach(() => {
  resetDebugRegistry();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AST scan timing events", () => {
  it("records one aggregate timing event with event-level cwd but no file paths in data", async () => {
    writeFileSync(path.join(tmpDir, "sample.ts"), "export const target = true;\n");
    const structural = {
      outline: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "target",
            kind: "variable",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 20,
            children: [],
          },
        ],
      }),
    } as unknown as StructuralProvider;

    await getStructuredPatternMatches({
      params: { pattern: "target", kind: "definition" },
      roots: [tmpDir],
      cwd: tmpDir,
      structural,
    });

    const events = getDebugEvents({
      source: "code-intelligence",
      category: "ast-scan.timing",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("AST definition scan analyzed 1 files"),
        cwd: tmpDir,
        data: {
          kind: "definition",
          operation: "outline",
          rootCount: 1,
          eligibleFileCount: 1,
          analyzedFileCount: 1,
          matchCount: 1,
          failureCount: 0,
          complete: true,
          timing: {
            durationMs: expect.any(Number),
            phasesMs: {
              enumeration: expect.any(Number),
              analysis: expect.any(Number),
            },
          },
        },
      }),
    ]);
    // Scan data stays path-free; only the event-level cwd carries identity.
    expect(JSON.stringify(events[0]?.data)).not.toContain(tmpDir);
  });
});
