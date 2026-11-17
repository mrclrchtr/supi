import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatReport, formatReview } from "../../src/format.mjs";
import { createContext, readInventory } from "../../src/inventory.mjs";
import { createMatrix } from "../../src/matrix.mjs";
import type { ExecutionReport, Operation } from "../../src/types.ts";
import { fixture, writeJson } from "../helpers/fixture.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function inventory() {
  const files = fixture();
  roots.push(files.root);
  writeJson(join(files.agentDir, "settings.json"), { packages: [] });
  return readInventory(createContext(files));
}

const removeClaudeMd: Operation = {
  action: "remove",
  scope: "global",
  name: "supi-claude-md",
  source: "npm:@mrclrchtr/supi-claude-md",
};

function report(status: "success" | "failed"): ExecutionReport {
  return {
    results: [{ operation: removeClaudeMd, status, output: "" }],
    inventory: inventory(),
    cancelled: false,
    ok: status === "success",
  };
}

describe("skills hints", () => {
  it("names the replacement for an obsolete removal before confirmation", () => {
    const lines = formatReview(createMatrix(inventory()), [removeClaudeMd])
      .map(({ text }) => text)
      .join("\n");
    expect(lines).toContain(
      "supi-claude-md: Skills moved to skills.sh: npx skills add mrclrchtr/supi -a pi --skill claude-md-improver claude-md-revision",
    );
  });

  it("points to SuPi skills only after successful changes", () => {
    const success = formatReport(report("success"));
    expect(success).toContain("supi-claude-md: Skills moved to skills.sh");
    expect(success).toContain(
      "npx skills add mrclrchtr/supi -a pi -g --skill claude-md-improver claude-md-revision commit",
    );

    const failure = formatReport(report("failed"));
    expect(failure).not.toContain("Skills moved");
    expect(failure).not.toContain("npx skills add");
  });
});
