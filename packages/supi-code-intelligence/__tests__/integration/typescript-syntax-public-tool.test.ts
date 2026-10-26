import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/extension.ts";
import { clearMockRuntime } from "../helpers/register-mock-runtime.ts";

describe("public TypeScript AST completeness", () => {
  it("returns complete call evidence through type-only re-exports and import-type arrays", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-typescript-public-"));
    writeFileSync(
      join(cwd, "index.ts"),
      ['export type * from "./types.ts";', "export function first() { measure(); }"].join("\n"),
    );
    writeFileSync(
      join(cwd, "entries.tsx"),
      ['let entries: import("node:fs").Dirent[];', "export function second() { measure(); }"].join(
        "\n",
      ),
    );
    const session = createTreeSitterSession(cwd);
    getDefaultWorkspaceRuntime().registerStructural(cwd, createTreeSitterProvider(session));
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    try {
      const result = (await getTool(pi, "code_find").execute(
        "typescript-syntax",
        { query: "measure", mode: "ast", kind: "call", scope: ["."] },
        undefined,
        undefined,
        makeCtx({ cwd }),
      )) as AgentToolResult<unknown>;
      expect(result.structuredContent).toMatchObject({
        kind: "completed",
        evidenceLists: [{ totalCount: 2, shownCount: 2, omittedCount: 0, partialReason: null }],
        scan: { complete: true, eligibleFileCount: 2, analyzedFileCount: 2, limitations: [] },
        failures: [],
        matches: expect.arrayContaining([
          expect.objectContaining({ name: "measure", file: "entries.tsx", line: 2 }),
          expect.objectContaining({ name: "measure", file: "index.ts", line: 2 }),
        ]),
      });
      const text = result.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
      expect(text).not.toContain("syntax-recovery");
      expect(text).not.toContain("total is unknown");
    } finally {
      await session.dispose();
      getDefaultWorkspaceRuntime().clearWorkspace(cwd);
      clearMockRuntime();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
