import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOrientation } from "../../../../src/session/orientation/collect.ts";
import { renderOrientationResult } from "../../../../src/tool/orientation/markdown.ts";
import { assembleOrientationResult } from "../../../../src/tool/result/orientation.ts";

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
          file,
          line: 1,
          character: 17,
          name: "sample",
          kind: "Function",
          anchorKind: "name",
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
          hover: async () => ({
            contents: "```typescript\nfunction sample(): number\n```\nSample docs.",
          }),
        } as never,
        lspRuntime: {
          kind: "ready",
          runtime: {
            fileDiagnostics: async () => [],
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
});
