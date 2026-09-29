import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRealSubstrateWorkspace,
  type RealSubstrateWorkspace,
} from "../helpers/real-substrate-workspace.ts";

/** Keep real plan and apply coverage without a separate verification toolchain. */
describe("TypeScript organize-imports planning and application", () => {
  let workspace: RealSubstrateWorkspace;

  beforeAll(async () => {
    workspace = await createRealSubstrateWorkspace();
  }, 30_000);

  afterAll(async () => {
    await workspace?.dispose();
  });

  it("keeps planning read-only and applies the precise import edits", async () => {
    const file = join(workspace.cwd, "src", "organize.ts");
    const original = [
      'import { helper } from "./contracts";',
      'import { ContractWidget } from "./contracts";',
      "export const organizedValue = helper();",
      "export const organizedWidget = new ContractWidget();",
      "",
    ].join("\n");
    writeFileSync(file, original);

    const plan = await workspace.session.planRefactor(
      {
        target: { anchor: { file, line: 3, character: 14 } },
        operation: { update_imports: {} },
      },
      { deadline: Date.now() + 15_000 },
    );
    expect(plan.kind).toBe("completed");
    if (plan.kind !== "completed") throw new Error(`Planning returned ${plan.kind}.`);
    expect(plan.plan.edits.edits.length).toBeGreaterThan(0);
    expect(readFileSync(file, "utf8")).toBe(original);

    const applied = await workspace.session.applyRefactor({ planId: plan.plan.id });
    expect(applied.kind).toBe("completed");
    expect(readFileSync(file, "utf8")).toBe(
      [
        'import { ContractWidget, helper } from "./contracts";',
        "export const organizedValue = helper();",
        "export const organizedWidget = new ContractWidget();",
        "",
      ].join("\n"),
    );
  }, 20_000);
});
