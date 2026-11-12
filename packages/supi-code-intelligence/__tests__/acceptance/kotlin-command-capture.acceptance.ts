// kotlin-lsp returns only command code actions. SuPi runs the selected command,
// captures the single workspace/applyEdit the server pushes, refuses it, and
// stores the edit as a plan. Requires kotlin-lsp and gradle on PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRealLanguageWorkspace,
  type RealLanguageWorkspace,
} from "../helpers/real-substrate-workspace.ts";
import { capturePlanTools } from "./command-capture-tools.ts";

function hasCommand(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_KOTLIN = hasCommand("kotlin-lsp") && hasCommand("gradle");
const FILE = "src/main/kotlin/Main.kt";

describe.skipIf(!HAS_KOTLIN)("Kotlin command-capture acceptance", () => {
  let workspace: RealLanguageWorkspace;
  let tools: ReturnType<typeof capturePlanTools>;

  function source(): string {
    return readFileSync(`${workspace.cwd}/${FILE}`, "utf8");
  }

  beforeAll(async () => {
    workspace = await createRealLanguageWorkspace({
      language: "kotlin",
      fixturePath: fileURLToPath(new URL("../fixtures/language-baseline/kotlin/", import.meta.url)),
      sourceFile: FILE,
    });
    tools = capturePlanTools(workspace);
  }, 300_000);

  afterAll(async () => {
    await workspace?.dispose();
  });

  it("plans organize imports from a captured command edit without writing", async () => {
    const before = source();

    const plan = await tools.planUntilCompleted({
      operation: { source_action: { file: FILE, kind: "source.organizeImports" } },
    });

    expect(source()).toBe(before);
    expect(plan.structuredContent).toMatchObject({
      action: { kind: "source.organizeImports", provenance: "captured-command" },
    });
    const text = plan.content.map((item) => item.text).join("\n");
    expect(text).toContain("**Source:** edit captured from the server command");
  }, 300_000);

  it("extracts a variable through a captured command edit and applies it", async () => {
    const before = source();
    const line = before.split("\n").findIndex((text) => text.includes("price * 2")) + 1;
    const character = (before.split("\n")[line - 1]?.indexOf("price * 2") ?? 0) + 1;

    const plan = await tools.planUntilCompleted({
      operation: {
        code_action: {
          file: FILE,
          range: { start: { line, character }, end: { line, character: character + 9 } },
          kind: "refactor.extract.variable",
        },
      },
    });

    expect(source()).toBe(before);
    expect(plan.structuredContent).toMatchObject({ action: { provenance: "captured-command" } });
    await tools.apply(plan);
    expect(source()).toMatch(/val \w+ = price \* 2/u);
  }, 300_000);
});
