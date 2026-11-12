// clangd tweaks are command-only code actions. clangd pushes the edit through
// workspace/applyEdit, waits for the reply, and then fails the command because
// SuPi refused the edit. The captured edit must still become a plan.

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRealLanguageWorkspace } from "../helpers/real-substrate-workspace.ts";
import { capturePlanTools } from "./command-capture-tools.ts";

describe("clangd command-capture acceptance", () => {
  it("plans and applies Extract subexpression to variable from a captured edit", async () => {
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), "clangd-capture-fixture-")));
    const source = "int total(int a, int b) {\n  return a * 2 + b * 3;\n}\n";
    mkdirSync(join(fixture, "src"));
    writeFileSync(join(fixture, "src/main.c"), source);
    writeFileSync(
      join(fixture, "compile_commands.json"),
      JSON.stringify([
        { directory: ".", file: "src/main.c", arguments: ["cc", "-c", "src/main.c"] },
      ]),
    );
    const workspace = await createRealLanguageWorkspace({
      language: "c",
      fixturePath: fixture,
      sourceFile: "src/main.c",
    });
    try {
      const tools = capturePlanTools(workspace);
      const read = () => readFileSync(join(workspace.cwd, "src/main.c"), "utf8");

      const plan = await tools.planUntilCompleted({
        operation: {
          code_action: {
            file: "src/main.c",
            range: { start: { line: 2, character: 10 }, end: { line: 2, character: 15 } },
            kind: "refactor",
            title: "Extract subexpression to variable",
          },
        },
      });

      expect(read()).toBe(source);
      expect(plan.structuredContent).toMatchObject({ action: { provenance: "captured-command" } });
      await tools.apply(plan);
      expect(read()).toMatch(/= a \* 2;/u);
    } finally {
      await workspace.dispose();
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 120_000);
});
