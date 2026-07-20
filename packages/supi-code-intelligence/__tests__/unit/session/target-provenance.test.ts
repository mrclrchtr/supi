import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerWorkflowTarget,
  type TargetProviderProvenance,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";

let cwd: string;
let file: string;
let store: Map<string, TargetStoreEntry>;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-provenance-"));
  file = path.join(cwd, "sample.ts");
  writeFileSync(file, "export type Sample = string;\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function register(confidence: "semantic" | "structural", provenance: TargetProviderProvenance[]) {
  const semantic = confidence === "semantic";
  return registerWorkflowTarget(store, cwd, {
    file,
    position: semantic ? { line: 0, character: 12 } : { line: 0, character: 7 },
    declarationPosition: semantic ? { line: 0, character: 0 } : { line: 0, character: 7 },
    displayLine: 1,
    displayCharacter: semantic ? 13 : 8,
    name: "Sample",
    kind: semantic ? "Variable" : "type",
    identityKind: "type",
    confidence,
    provenance,
    anchorKind: semantic ? "name" : "declaration",
    container: null,
  });
}

describe("type-alias target provider provenance", () => {
  it.each([
    ["structural then semantic", ["structural", "semantic"]],
    ["semantic then structural", ["semantic", "structural"]],
  ] as const)("unions provider observations monotonically: %s", (_label, order) => {
    const first = register(order[0], [order[0]]);
    const refined = register(order[1], [order[1]]);
    const repeated = register("semantic", ["semantic"]);

    expect(refined.targetId).toBe(first.targetId);
    expect(refined.entry).toMatchObject({
      kind: "Variable",
      confidence: "semantic",
      provenance: ["semantic", "structural"],
    });
    expect(repeated.entry.provenance).toEqual(["semantic", "structural"]);
  });
});
