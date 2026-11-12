/** Public-tool helpers shared by the command-capture acceptance tests. */

import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { expect } from "vitest";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import { waitFor } from "../helpers/integration-utils.ts";
import type { RealLanguageWorkspace } from "../helpers/real-substrate-workspace.ts";

export interface ToolResult {
  readonly content: readonly { readonly text?: string }[];
  readonly structuredContent?: unknown;
  readonly details: { readonly status?: string; readonly data: unknown };
}

/** Run plan and apply through the registered public tools of one workspace. */
export function capturePlanTools(workspace: RealLanguageWorkspace) {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => workspace.session);
  const run = async (name: string, input: unknown): Promise<ToolResult> =>
    (await getTool(pi, name).execute(
      `capture-${name}`,
      input,
      undefined,
      undefined,
      makeCtx({ cwd: workspace.cwd }),
    )) as ToolResult;

  return {
    run,
    /** Plan repeatedly while the server is still importing or indexing. */
    planUntilCompleted: (input: unknown): Promise<ToolResult> =>
      waitFor(
        () => run("code_refactor_plan", input),
        (result) => result.details.status === "completed",
        { timeoutMs: 240_000, retryDelayMs: 3_000, label: "command-capture plan" },
      ),
    /** Apply a completed plan by its returned plan ID. */
    apply: async (plan: ToolResult): Promise<void> => {
      const text = plan.content.map((item) => item.text).join("\n");
      const planId = /planId: "([^"]+)"/u.exec(text)?.[1];
      if (!planId) throw new Error(`No plan ID: ${JSON.stringify(plan.structuredContent)}`);
      const applied = await run("code_refactor_apply", { planId });
      expect(applied.details.status).toBe("completed");
    },
  };
}
