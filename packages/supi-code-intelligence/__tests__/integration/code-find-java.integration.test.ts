import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/extension.ts";

let cwd: string | undefined;
let treeSitter: ReturnType<typeof createTreeSitterSession> | undefined;

afterEach(async () => {
  await treeSitter?.dispose();
  if (cwd) {
    getDefaultWorkspaceRuntime().clearWorkspace(cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
  treeSitter = undefined;
  cwd = undefined;
});

describe("public Java AST search", () => {
  it("finds a field in an anonymous class with the real parser", async () => {
    cwd = mkdtempSync(join(tmpdir(), "code-find-java-"));
    writeFileSync(
      join(cwd, "Host.java"),
      `class Host {
  Object value = new Object() {
    int hidden;
    void run() {}
  };
  void work() {
    int local = 1;
  }
}
`,
    );
    treeSitter = createTreeSitterSession(cwd);
    getDefaultWorkspaceRuntime().registerStructural(cwd, createTreeSitterProvider(treeSitter));
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find");

    const result = await tool.execute(
      "java-anonymous-field",
      { query: "hidden", mode: "ast", kind: "definition", scope: ["Host.java"] },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    const content = JSON.stringify(result);
    expect(content).toContain("`hidden` (field) L3:");
    expect(content).not.toContain("`local` (variable)");
  });
});
