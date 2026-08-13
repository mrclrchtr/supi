import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CodeRequestControl,
  completedCodeQuery,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runGraphWorkflow } from "../../../src/session/graph-workflow.ts";
import { runInspectWorkflow } from "../../../src/session/inspect-workflow.ts";
import { runOrientationWorkflow } from "../../../src/session/orientation-workflow.ts";
import { WorkspaceCodeIntelligenceSession } from "../../../src/session/session.ts";
import type { TargetStoreEntry } from "../../../src/session/target-store.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function workspace(): { cwd: string; file: string } {
  const cwd = mkdtempSync(join(tmpdir(), "structural-workflow-control-"));
  directories.push(cwd);
  const file = join(cwd, "sample.ts");
  writeFileSync(file, "export function run() { target(); }\n");
  return { cwd, file };
}

function structural(spies: {
  nodeAt?: ReturnType<typeof vi.fn>;
  outline?: ReturnType<typeof vi.fn>;
  imports?: ReturnType<typeof vi.fn>;
  exports?: ReturnType<typeof vi.fn>;
  calleesAt?: ReturnType<typeof vi.fn>;
}): StructuralProvider {
  return {
    nodeAt:
      spies.nodeAt ??
      vi.fn(async () => ({
        kind: "success",
        data: {
          type: "identifier",
          text: "run",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 20,
          ancestry: [],
        },
      })),
    outline: spies.outline ?? vi.fn(async () => ({ kind: "success", data: [] })),
    imports: spies.imports ?? vi.fn(async () => ({ kind: "success", data: [] })),
    exports: spies.exports ?? vi.fn(async () => ({ kind: "success", data: [] })),
    calleesAt:
      spies.calleesAt ??
      vi.fn(async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "run", startLine: 1, endLine: 1 },
          callees: [],
          depth: "direct",
        },
      })),
    callSites: vi.fn(async () => ({ kind: "success", data: [] })),
  } as StructuralProvider;
}

function control(): CodeRequestControl {
  return { signal: new AbortController().signal, deadline: Date.now() + 60_000 };
}

function expectLastArgument(spy: ReturnType<typeof vi.fn>, expected: CodeRequestControl): void {
  expect(spy.mock.calls[0]?.at(-1)).toBe(expected);
}

describe("structural workflow request control", () => {
  it("forwards exact control through file target resolution", async () => {
    const { cwd, file } = workspace();
    const outline = vi.fn(async () => ({
      kind: "success" as const,
      data: [
        {
          name: "run",
          kind: "function",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 20,
          children: [],
        },
      ],
    }));
    const semantic = {
      references: async () => completedCodeQuery([]),
      implementation: async () => completedCodeQuery([]),
      documentSymbols: async () => completedCodeQuery([]),
      workspaceSymbols: async () => completedCodeQuery([]),
    } satisfies SemanticProvider;
    const requestControl = control();
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      new TestCapabilityAdapter({ semantic, structural: structural({ outline }) }),
    );

    await session.resolve({ target: { file } }, requestControl);

    expectLastArgument(outline, requestControl);
  });

  it("forwards exact control through point inspection", async () => {
    const { cwd, file } = workspace();
    const nodeAt = vi.fn(structural({}).nodeAt);
    const outline = vi.fn(structural({}).outline);
    const requestControl = control();

    await runInspectWorkflow(
      { point: { file, line: 1, character: 17 } },
      {
        cwd,
        capability: new TestCapabilityAdapter({ structural: structural({ nodeAt, outline }) }),
      },
      requestControl,
    );

    expectLastArgument(nodeAt, requestControl);
    expectLastArgument(outline, requestControl);
  });

  it("forwards exact control through file orientation", async () => {
    const { cwd, file } = workspace();
    const outline = vi.fn(structural({}).outline);
    const imports = vi.fn(structural({}).imports);
    const exports = vi.fn(structural({}).exports);
    const requestControl = control();

    await runOrientationWorkflow(
      { focus: { path: file } },
      {
        cwd,
        capability: new TestCapabilityAdapter({
          structural: structural({ outline, imports, exports }),
        }),
        lookupTargetId: () => ({ kind: "unavailable", reason: "unused" }),
        registerTarget: () => {
          throw new Error("unused");
        },
        nativeInstructionPaths: new Set(),
        surfacedInstructionDirs: new Set(),
        markInstructionDirsSurfaced: () => {},
        projectTrusted: false,
      },
      requestControl,
    );

    expectLastArgument(outline, requestControl);
    expectLastArgument(imports, requestControl);
    expectLastArgument(exports, requestControl);
  });

  it("forwards exact control through structural graph collection", async () => {
    const { cwd, file } = workspace();
    const calleesAt = vi.fn(structural({}).calleesAt);
    const requestControl = control();
    const entry: TargetStoreEntry = {
      targetId: "target-1",
      spanId: "span-1",
      file,
      position: { line: 0, character: 16 },
      declarationPosition: { line: 0, character: 0 },
      declarationOccurrence: 0,
      displayLine: 1,
      displayCharacter: 17,
      name: "run",
      kind: "Function",
      confidence: "semantic",
      provenance: ["semantic"],
      anchorKind: "name",
      fileFingerprint: "fingerprint",
      container: null,
    };

    await runGraphWorkflow(
      { target: { handle: entry.targetId }, relations: ["callees"] },
      {
        cwd,
        capability: new TestCapabilityAdapter({ structural: structural({ calleesAt }) }),
        lookupTargetId: () => ({ kind: "available", entry }),
        registerTarget: () => {
          throw new Error("unused");
        },
      },
      requestControl,
    );

    const options = calleesAt.mock.calls[0]?.[3] as { control?: CodeRequestControl };
    expect(options.control).toBe(requestControl);
  });
});
