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
  writeFileSync(file, "export function sample() {}\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function register(confidence: "semantic" | "structural", provenance: TargetProviderProvenance[]) {
  return registerWorkflowTarget(store, cwd, {
    file,
    position: { line: 0, character: 16 },
    declarationPosition: { line: 0, character: 7 },
    displayLine: 1,
    displayCharacter: 17,
    name: "sample",
    kind: "Function",
    identityKind: "function",
    confidence,
    provenance,
    anchorKind: "name",
    container: null,
  });
}

describe("target provider provenance", () => {
  it.each([
    ["structural then semantic", ["structural", "semantic"]],
    ["semantic then structural", ["semantic", "structural"]],
  ] as const)("unions provider observations monotonically: %s", (_label, order) => {
    const first = register(order[0], [order[0]]);
    const refined = register(order[1], [order[1]]);
    const repeated = register("semantic", ["semantic"]);

    expect(refined.targetId).toBe(first.targetId);
    expect(refined.entry.confidence).toBe("semantic");
    expect(refined.entry.provenance).toEqual(["semantic", "structural"]);
    expect(repeated.entry.provenance).toEqual(["semantic", "structural"]);
  });
});
