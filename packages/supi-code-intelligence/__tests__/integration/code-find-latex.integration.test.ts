import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../src/session/session.ts";
import { executeFindTool } from "../../src/tool/code_find/execute.ts";
import { TestCapabilityAdapter } from "../helpers/test-capability-adapter.ts";

let cwd: string;

afterEach(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("code_find with the real LaTeX structural provider", () => {
  it("finds imports and rejects unsupported export analysis", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "code-find-latex-"));
    writeFileSync(
      path.join(cwd, "paper.tex"),
      String.raw`\section{Overview}
\newcommand{\custom}{value}
\input{chapters/method}
\usepackage{amsmath}
`,
    );

    const treeSitter = createTreeSitterSession(cwd);
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      new TestCapabilityAdapter({ structural: createTreeSitterProvider(treeSitter) }),
    );
    const ctx = { cwd, session };
    try {
      const imports = await executeFindTool(
        { query: "chapters/method", mode: "ast", kind: "import", scope: ["paper.tex"] },
        ctx,
      );
      expect(imports.content).toContain("`chapters/method` (import) L3");

      for (const [kind, operation] of [
        ["export", "exports"],
        ["call", "call-sites"],
      ] as const) {
        const unsupported = await executeFindTool(
          { query: "custom", mode: "ast", kind, scope: ["paper.tex"] },
          ctx,
        );
        expect(unsupported.content).toContain(`does not support the ${operation} operation`);
      }
    } finally {
      await treeSitter.dispose();
    }
  });
});
