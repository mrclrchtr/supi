// kotlin-lsp returns only command code actions. SuPi runs the selected command,
// captures the single workspace/applyEdit the server pushes, refuses it, and
// stores the edit as a plan. Requires kotlin-lsp and gradle on PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import { waitFor } from "../helpers/integration-utils.ts";
import {
  createRealLanguageWorkspace,
  type RealLanguageWorkspace,
} from "../helpers/real-substrate-workspace.ts";

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

interface ToolResult {
  readonly content: readonly { readonly text?: string }[];
  readonly structuredContent?: unknown;
  readonly details: { readonly status?: string; readonly data: unknown };
}

describe.skipIf(!HAS_KOTLIN)("Kotlin command-capture acceptance", () => {
  let workspace: RealLanguageWorkspace;
  let pi: ReturnType<typeof createPiMock>;

  async function run(name: string, input: unknown): Promise<ToolResult> {
    return (await getTool(pi, name).execute(
      `kotlin-${name}`,
      input,
      undefined,
      undefined,
      makeCtx({ cwd: workspace.cwd }),
    )) as ToolResult;
  }

  function source(): string {
    return readFileSync(`${workspace.cwd}/${FILE}`, "utf8");
  }

  function planId(result: ToolResult): string {
    const match = /planId: "([^"]+)"/u.exec(result.content.map((item) => item.text).join("\n"));
    if (!match?.[1]) throw new Error(`No plan ID: ${JSON.stringify(result.structuredContent)}`);
    return match[1];
  }

  /** kotlin-lsp offers actions only after its Gradle import finishes. */
  async function planUntilOffered(input: unknown): Promise<ToolResult> {
    return waitFor(
      () => run("code_refactor_plan", input),
      (result) => result.details.status === "completed",
      { timeoutMs: 240_000, retryDelayMs: 3_000, label: "kotlin-lsp code action" },
    );
  }

  beforeAll(async () => {
    workspace = await createRealLanguageWorkspace({
      language: "kotlin",
      fixturePath: fileURLToPath(new URL("../fixtures/language-baseline/kotlin/", import.meta.url)),
      sourceFile: FILE,
    });
    pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, () => workspace.session);
  }, 300_000);

  afterAll(async () => {
    await workspace?.dispose();
  });

  it("plans organize imports from a captured command edit without writing", async () => {
    const before = source();

    const plan = await planUntilOffered({
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

    const plan = await planUntilOffered({
      operation: {
        code_action: {
          file: FILE,
          range: { start: { line, character }, end: { line, character: character + 9 } },
          kind: "refactor.extract.variable",
        },
      },
    });

    expect(source()).toBe(before);
    expect(plan.structuredContent).toMatchObject({
      action: { provenance: "captured-command" },
    });
    const applied = await run("code_refactor_apply", { planId: planId(plan) });
    expect(applied.details.status).toBe("completed");
    expect(source()).not.toBe(before);
    expect(source()).toMatch(/val \w+ = price \* 2/u);
  }, 300_000);
});
