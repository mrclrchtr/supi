import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/graph/execute.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-graph-read-next-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "graph-ws" }));
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("code_graph read-next guidance", () => {
  it("renders source ranges for the resolved target and relation sites", async () => {
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      "export function foo() { bar(); }\nfunction bar() {}\n",
    );
    writeFileSync(path.join(tmpDir, "consumer.ts"), "import { foo } from './index';\nfoo();\n");

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "consumer.ts")}`,
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
        },
      ],
      calleesAt: async () => ({
        kind: "success" as const,
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
          callees: [{ name: "bar", startLine: 1, endLine: 1 }],
          depth: "direct" as const,
        },
      }),
    });

    const result = await executeGraphTool(
      { file: "index.ts", line: 1, character: 17, relations: ["references", "callees"] },
      { cwd: tmpDir, session: sessionCache.getOrCreate(tmpDir) },
    );

    expect(result.content).toContain("## Read Next");
    expect(result.content).toContain("`index.ts` L1");
    expect(result.content).toContain("inspect the resolved target before editing");
    expect(result.content).toContain("`consumer.ts` L1–L42");
    expect(result.content).toContain("inspect a reference site");
    expect(result.content).toContain("`read` offset 1, limit");
  });
});
