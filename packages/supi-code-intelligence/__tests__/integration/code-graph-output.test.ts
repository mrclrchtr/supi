import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../src/tool/code_graph/execute.ts";
import { makeTestCtx } from "../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "graph-real-provider-"));
  writeFileSync(
    path.join(cwd, "calls.ts"),
    "function work() {\n  bar(); bar();\n  const task = () => bar();\n}\n",
  );
});

afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

describe("code_graph with the real structural provider", () => {
  it("shows short syntax labels without merging distinct source expressions", async () => {
    writeFileSync(
      path.join(cwd, "calls.ts"),
      [
        "function work() {",
        `  values.map((v) => \`first \${v}\`).join(",");`,
        `  values.map((v) => \`second \${v}\`).join(",");`,
        "}",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);
    try {
      registerMockProvider(cwd, { calleesAt: createTreeSitterProvider(session).calleesAt });
      const result = await executeGraphTool(
        {
          target: { anchor: { file: "calls.ts", line: 1, character: 10 } },
          relations: ["callees"],
          maxResults: 20,
        },
        makeTestCtx(cwd),
      );
      expect(result.content).toContain("4 call sites");
      expect(result.content).toContain("`values.map(…).join` (expression 1/2) — L2:3");
      expect(result.content).toContain("`values.map(…).join` (expression 2/2) — L3:3");
      expect(result.content).not.toContain(`first \${v}`);
      expect(result.content).not.toContain(`second \${v}`);
    } finally {
      await session.dispose();
    }
  });

  it("keeps exact call-site columns through the provider and graph output", async () => {
    const session = createTreeSitterSession(cwd);
    try {
      registerMockProvider(cwd, { calleesAt: createTreeSitterProvider(session).calleesAt });
      const input = {
        target: { anchor: { file: "calls.ts", line: 1, character: 10 } },
        relations: ["callees"] as const,
      };
      const direct = await executeGraphTool(
        { ...input, relations: [...input.relations] },
        makeTestCtx(cwd),
      );
      expect(direct.content).toContain("2 call sites");
      expect(direct.content).toContain("`bar` — L2:3, L2:10");
      expect(direct.details?.displaySections?.[0]?.lines).toEqual(["L2:3 — bar", "L2:10 — bar"]);
      if (direct.details?.type !== "graph") throw new Error("Expected graph details");
      expect(direct.details.data.sections[0].fileGroups).toEqual([{ file: "calls.ts", count: 2 }]);
      const deep = await executeGraphTool(
        { ...input, relations: [...input.relations], calleeDepth: "deep" },
        makeTestCtx(cwd),
      );
      expect(deep.content).toContain("3 call sites");
      expect(deep.content).toContain("`bar` — L2:3, L2:10, L3:22");
      expect(deep.content.match(/`bar`/g)).toHaveLength(1);
    } finally {
      await session.dispose();
    }
  });
});
