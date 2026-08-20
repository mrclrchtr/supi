import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOrientation } from "../../../../src/session/orientation/collect.ts";
import { renderOrientationResult } from "../../../../src/tool/code_orientation/markdown.ts";
import { assembleOrientationResult } from "../../../../src/tool/code_orientation/result.ts";

let tmpDir: string;
let file: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "orientation-hover-"));
  file = path.join(tmpDir, "sample.ts");
  writeFileSync(file, "export function sample(): number { return 1; }\n");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("target Orientation hover markdown", () => {
  it("keeps fenced hover content closed before definition actions", async () => {
    const result = await executeOrientation(
      {
        target: {
          targetId: "test-target",
          spanId: "test-span",
          file,
          position: { line: 0, character: 16 },
          displayLine: 1,
          displayCharacter: 17,
          name: "sample",
          kind: "Function",
          confidence: "semantic",
          provenance: [],
          anchorKind: "name",
          fileFingerprint: "test",
          container: null,
        },
        maxResults: 5,
      },
      {
        cwd: tmpDir,
        model: {} as never,
        provider: {
          nodeAt: async () => ({
            kind: "success",
            data: {
              type: "identifier",
              text: "sample",
              startLine: 1,
              startCharacter: 17,
              endLine: 1,
              endCharacter: 23,
              ancestry: [],
            },
          }),
          outline: async () => ({ kind: "success", data: [] }),
          imports: async () => ({ kind: "success", data: [] }),
          exports: async () => ({ kind: "success", data: [] }),
          hover: async () =>
            completedCodeQuery({
              contents: "```typescript\nfunction sample(): number\n```\nSample docs.",
            }),
        } as never,
        lspRuntime: {
          kind: "ready",
          runtime: {
            fileDiagnostics: async () => completedCodeQuery([]),
          },
        } as never,
      },
    );

    const markdown = renderOrientationResult(assembleOrientationResult(result));

    expect(markdown).toContain(
      "- Hover:\n```typescript\nfunction sample(): number\n```\nSample docs.",
    );
    expect(markdown).not.toContain("- Hover: ```typescript");
  });

  it("withholds position-strict substrate evidence for declaration anchors", async () => {
    let nodeAtCalls = 0;
    let hoverCalls = 0;
    const result = await executeOrientation(
      {
        target: {
          targetId: "test-target",
          spanId: "test-span",
          file,
          position: { line: 0, character: 0 },
          displayLine: 1,
          displayCharacter: 1,
          name: "sample",
          kind: "Function",
          confidence: "semantic",
          provenance: [],
          anchorKind: "declaration",
          fileFingerprint: "test",
          container: null,
        },
        maxResults: 5,
      },
      {
        cwd: tmpDir,
        model: {} as never,
        provider: {
          nodeAt: async () => {
            nodeAtCalls++;
            return {
              kind: "success",
              data: {
                type: "identifier",
                text: "sample",
                startLine: 1,
                startCharacter: 1,
                endLine: 1,
                endCharacter: 7,
                ancestry: [],
              },
            };
          },
          outline: async () => ({ kind: "success", data: [] }),
          imports: async () => ({ kind: "success", data: [] }),
          exports: async () => ({ kind: "success", data: [] }),
          hover: async () => {
            hoverCalls++;
            return completedCodeQuery({ contents: "should not appear" });
          },
        } as never,
        lspRuntime: {
          kind: "ready",
          runtime: {
            fileDiagnostics: async () => completedCodeQuery([]),
          },
        } as never,
      },
    );

    const markdown = renderOrientationResult(assembleOrientationResult(result));

    expect(nodeAtCalls).toBe(0);
    expect(hoverCalls).toBe(0);
    expect(markdown).toContain("Node and hover evidence withheld");
    expect(markdown).not.toContain("should not appear");
  });
});
