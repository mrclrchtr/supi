import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkspaceCodeIntelligenceSession } from "../../src/session/session.ts";
import {
  CONTRACT_FIXTURE,
  CONTRACT_POINT,
  createRealSubstrateWorkspace,
  type RealSubstrateWorkspace,
} from "../helpers/real-substrate-workspace.ts";

const TYPESCRIPT_AST_EXPECTATIONS = [
  { kind: "definition", resultKind: "class", query: "ContractWidget", line: 7 },
  { kind: "import", resultKind: "import", query: "node:path", line: 1 },
  { kind: "export", resultKind: "class", query: "ContractWidget", line: 7 },
  { kind: "call", resultKind: "call", query: "join", line: 13 },
  { kind: "type", resultKind: "type", query: "ContractAlias", line: 2 },
  { kind: "interface", resultKind: "interface", query: "Contract", line: 3 },
  { kind: "class", resultKind: "class", query: "ContractWidget", line: 7 },
  { kind: "method", resultKind: "method", query: "renderContract", line: 8 },
  { kind: "enum", resultKind: "enum", query: "ContractState", line: 6 },
] as const;

const PYTHON_AST_EXPECTATIONS = [
  { kind: "call", supported: true },
  { kind: "definition", supported: false },
  { kind: "import", supported: false },
  { kind: "export", supported: false },
  { kind: "type", supported: false },
  { kind: "interface", supported: false },
  { kind: "class", supported: false },
  { kind: "method", supported: false },
  { kind: "enum", supported: false },
] as const;

type FindOutcome = Awaited<ReturnType<WorkspaceCodeIntelligenceSession["find"]>>;
type ResolveOutcome = Awaited<ReturnType<WorkspaceCodeIntelligenceSession["resolve"]>>;

describe("WorkspaceCodeIntelligenceSession real-substrate contract", () => {
  let workspace: RealSubstrateWorkspace | null = null;

  beforeAll(async () => {
    workspace = await createRealSubstrateWorkspace();
  }, 30_000);

  afterAll(async () => {
    const current = workspace;
    workspace = null;
    await current?.dispose();
  });

  it.each(TYPESCRIPT_AST_EXPECTATIONS)(
    "finds TypeScript $kind evidence through the session boundary",
    async ({ kind, resultKind, query, line }) => {
      const result = astResult(
        await getWorkspace().session.find({
          query,
          mode: "ast",
          kind,
          scope: [CONTRACT_FIXTURE.contracts],
        }),
      );

      expect(result.scan.complete).toBe(true);
      expect(result.partialReason).toBeNull();
      expect(result.matches).toContainEqual({
        file: CONTRACT_FIXTURE.contracts,
        name: query,
        kind: resultKind,
        line,
      });
    },
  );

  it.each(PYTHON_AST_EXPECTATIONS)(
    "records the Python $kind support expectation",
    async ({ kind, supported }) => {
      const result = astResult(
        await getWorkspace().session.find({
          query: "pythonHelper",
          mode: "ast",
          kind,
          scope: [CONTRACT_FIXTURE.python],
        }),
      );

      if (supported) {
        expect(result.matches).toContainEqual({
          file: CONTRACT_FIXTURE.python,
          name: "pythonHelper",
          kind: "call",
          line: 2,
        });
        expect(result.partialReason).toBeNull();
        return;
      }

      expect(result.matches).toEqual([]);
      expect(result.partialReason).toBe("provider-limited");
      expect(result.scan).toMatchObject({
        complete: false,
        analyzedFileCount: 0,
        limitations: [{ reason: "provider-failure", pathCount: 1 }],
      });
    },
  );

  it("establishes reusable file, symbol, and anchored targets through initial and warm readiness", async () => {
    const session = getWorkspace().session;
    const fileOutcome = await session.resolve({
      target: { file: CONTRACT_FIXTURE.contracts },
      maxResults: 20,
    });
    expect(fileOutcome.kind).toBe("target-group");
    if (fileOutcome.kind !== "target-group") throw new Error("Expected a Target group.");

    const fileTarget = fileOutcome.targets.find((target) => target.name === "coordinateTarget");
    if (!fileTarget) throw new Error("Expected coordinateTarget in the Target group.");

    const symbolTarget = resolvedEntry(
      await session.resolve({
        target: { symbol: { query: "coordinateTarget", scope: CONTRACT_FIXTURE.contracts } },
      }),
    );
    const anchoredTarget = resolvedEntry(
      await session.resolve({ target: { anchor: CONTRACT_POINT.coordinateTarget } }),
    );
    const warmSymbolTarget = resolvedEntry(
      await session.resolve({
        target: { symbol: { query: "coordinateTarget", scope: CONTRACT_FIXTURE.contracts } },
      }),
    );

    expect(anchoredTarget.position).toEqual({ line: 14, character: 25 });
    expect([
      fileTarget.targetId,
      symbolTarget.targetId,
      anchoredTarget.targetId,
      warmSymbolTarget.targetId,
    ]).toEqual([
      fileTarget.targetId,
      fileTarget.targetId,
      fileTarget.targetId,
      fileTarget.targetId,
    ]);
  }, 15_000);

  it("distinguishes completed-empty, partial, unsupported, and unavailable AST outcomes", async () => {
    const session = getWorkspace().session;
    const empty = astResult(
      await session.find({
        query: "AbsentContractClass",
        mode: "ast",
        kind: "class",
        scope: [CONTRACT_FIXTURE.contracts],
      }),
    );
    expect(empty.matches).toEqual([]);
    expect(empty.partialReason).toBeNull();
    expect(empty.scan.complete).toBe(true);

    const partial = astResult(
      await session.find({
        query: "pythonHelper",
        mode: "ast",
        kind: "definition",
        scope: [CONTRACT_FIXTURE.python],
      }),
    );
    expect(partial.matches).toEqual([]);
    expect(partial.partialReason).toBe("provider-limited");
    expect(partial.scan.complete).toBe(false);

    const unsupported = await session.find({
      query: "fixture",
      mode: "ast",
      kind: "definition",
      scope: [CONTRACT_FIXTURE.unsupported],
    });
    expect(unsupported).toMatchObject({
      kind: "invalid-input",
      message: expect.stringContaining("no supported Tree-sitter grammar"),
    });

    const workspace = getWorkspace();
    workspace.disableStructural();
    try {
      await expect(
        session.find({
          query: "ContractWidget",
          mode: "ast",
          kind: "class",
          scope: [CONTRACT_FIXTURE.contracts],
        }),
      ).resolves.toMatchObject({
        kind: "unavailable",
        reason: expect.stringContaining("No structural provider"),
      });
    } finally {
      workspace.enableStructural();
    }
  });

  it("preserves real provider coordinates through inspection and graph evidence", async () => {
    const workspace = getWorkspace();
    const inspection = await workspace.session.inspect({ point: CONTRACT_POINT.consumerHelper });
    expect(inspection.kind).toBe("completed");
    if (inspection.kind !== "completed") throw new Error("Expected completed point inspection.");
    expect(inspection.data.node).toMatchObject({
      text: "helper",
      startLine: 3,
      startCharacter: 10,
    });
    expect(inspection.data.definitions).toContainEqual({
      file: CONTRACT_FIXTURE.contracts,
      line: 12,
      character: 17,
    });

    const helper = resolvedEntry(
      await workspace.session.resolve({
        target: { symbol: { query: "helper", scope: CONTRACT_FIXTURE.contracts } },
      }),
    );
    const references = await workspace.session.graph({
      target: { handle: helper.targetId },
      relations: ["references"],
    });
    expect(references).toMatchObject({
      kind: "completed",
      sections: expect.arrayContaining([
        expect.objectContaining({
          kind: "ok",
          rel: "references",
          data: expect.objectContaining({
            references: expect.arrayContaining([
              expect.objectContaining({
                file: join(workspace.cwd, CONTRACT_FIXTURE.consumer),
                line: 3,
                character: 10,
              }),
            ]),
          }),
        }),
      ]),
    });

    const contract = resolvedEntry(
      await workspace.session.resolve({
        target: {
          symbol: {
            query: "Contract",
            scope: CONTRACT_FIXTURE.contracts,
            symbolKind: "interface",
          },
        },
      }),
    );
    const implementations = await workspace.session.graph({
      target: { handle: contract.targetId },
      relations: ["implements"],
    });
    expect(implementations).toMatchObject({
      kind: "completed",
      sections: expect.arrayContaining([
        expect.objectContaining({
          kind: "ok",
          rel: "implements",
          data: expect.objectContaining({
            implementations: expect.arrayContaining([
              expect.objectContaining({
                file: join(workspace.cwd, CONTRACT_FIXTURE.contracts),
                line: 7,
                character: 14,
              }),
            ]),
          }),
        }),
      ]),
    });
  }, 15_000);

  function getWorkspace(): RealSubstrateWorkspace {
    if (!workspace) throw new Error("Real substrate workspace was not initialized.");
    return workspace;
  }
});

function astResult(outcome: FindOutcome) {
  expect(outcome.kind).toBe("completed");
  if (outcome.kind !== "completed" || outcome.data.kind !== "ast") {
    throw new Error("Expected a completed AST workflow outcome.");
  }
  return outcome.data.result;
}

function resolvedEntry(outcome: ResolveOutcome) {
  expect(outcome.kind).toBe("resolved");
  if (outcome.kind !== "resolved") throw new Error("Expected a resolved Target.");
  return outcome.entry;
}
