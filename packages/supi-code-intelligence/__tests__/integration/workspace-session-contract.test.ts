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
  {
    kind: "definition",
    resultKind: "class",
    query: "ContractWidget",
    line: 7,
    startCharacter: 8,
    endLine: 11,
    endCharacter: 2,
    commonKind: "class",
    nativeKind: "class",
  },
  {
    kind: "import",
    resultKind: "import",
    query: "node:path",
    line: 1,
    startCharacter: 1,
    endLine: 1,
    endCharacter: 34,
  },
  {
    kind: "export",
    resultKind: "class",
    query: "ContractWidget",
    line: 7,
    startCharacter: 8,
    endLine: 11,
    endCharacter: 2,
  },
  {
    kind: "call",
    resultKind: "call",
    query: "join",
    line: 13,
    startCharacter: 10,
    endLine: 13,
    endCharacter: 14,
  },
  {
    kind: "type",
    resultKind: "type alias",
    query: "ContractAlias",
    line: 2,
    startCharacter: 8,
    endLine: 2,
    endCharacter: 44,
    commonKind: "type",
    nativeKind: "type alias",
  },
  {
    kind: "interface",
    resultKind: "interface",
    query: "Contract",
    line: 3,
    startCharacter: 8,
    endLine: 5,
    endCharacter: 2,
    commonKind: "interface",
    nativeKind: "interface",
  },
  {
    kind: "class",
    resultKind: "class",
    query: "ContractWidget",
    line: 7,
    startCharacter: 8,
    endLine: 11,
    endCharacter: 2,
    commonKind: "class",
    nativeKind: "class",
  },
  {
    kind: "method",
    resultKind: "method",
    query: "renderContract",
    line: 8,
    startCharacter: 3,
    endLine: 10,
    endCharacter: 4,
    commonKind: "method",
    nativeKind: "method",
  },
  {
    kind: "enum",
    resultKind: "enum",
    query: "ContractState",
    line: 6,
    startCharacter: 8,
    endLine: 6,
    endCharacter: 46,
    commonKind: "enum",
    nativeKind: "enum",
  },
] as const;

const PYTHON_AST_EXPECTATIONS = [
  {
    kind: "call",
    supported: true,
    query: "pythonHelper",
    resultKind: "call",
    line: 2,
    startCharacter: 12,
    endLine: 2,
    endCharacter: 24,
  },
  {
    kind: "definition",
    supported: true,
    query: "invoke_python",
    resultKind: "function",
    line: 1,
    startCharacter: 1,
    endLine: 2,
    endCharacter: 26,
    commonKind: "function",
    nativeKind: "function",
  },
  { kind: "import", supported: true, query: "pythonHelper" },
  { kind: "export", supported: false, query: "pythonHelper" },
  { kind: "type", supported: true, query: "pythonHelper" },
  { kind: "interface", supported: true, query: "pythonHelper" },
  { kind: "class", supported: true, query: "pythonHelper" },
  { kind: "method", supported: true, query: "pythonHelper" },
  { kind: "enum", supported: true, query: "pythonHelper" },
] as const;

const TRANCHE_TWO_AST_EXPECTATIONS = [
  {
    file: CONTRACT_FIXTURE.cpp,
    query: "NativeModel",
    resultKind: "struct",
    startCharacter: 17,
    endLine: 1,
    endCharacter: 53,
    commonKind: "struct",
    nativeKind: "struct",
  },
  {
    file: CONTRACT_FIXTURE.java,
    query: "JavaModel",
    resultKind: "record",
    startCharacter: 1,
    endLine: 1,
    endCharacter: 43,
    commonKind: "record",
    nativeKind: "record",
  },
  {
    file: CONTRACT_FIXTURE.kotlin,
    query: "KotlinModel",
    resultKind: "object",
    startCharacter: 1,
    endLine: 1,
    endCharacter: 36,
  },
] as const;

const TRANCHE_THREE_AST_EXPECTATIONS = [
  {
    file: CONTRACT_FIXTURE.ruby,
    kind: "class",
    query: "RubyModel",
    resultKind: "class",
    line: 1,
    startCharacter: 1,
    endLine: 3,
    endCharacter: 4,
  },
  {
    file: CONTRACT_FIXTURE.ruby,
    kind: "method",
    query: "run",
    resultKind: "method",
    line: 2,
    startCharacter: 3,
    endLine: 2,
    endCharacter: 15,
  },
  {
    file: CONTRACT_FIXTURE.bash,
    kind: "definition",
    query: "shell_task",
    resultKind: "function",
    line: 1,
    startCharacter: 1,
    endLine: 1,
    endCharacter: 26,
  },
  {
    file: CONTRACT_FIXTURE.r,
    kind: "definition",
    query: "r_task",
    resultKind: "function",
    line: 1,
    startCharacter: 1,
    endLine: 1,
    endCharacter: 23,
  },
] as const;

const TRANCHE_FOUR_AST_EXPECTATIONS = [
  {
    file: CONTRACT_FIXTURE.html,
    kind: "definition",
    query: "contract-root",
    resultKind: "element",
    line: 1,
    startCharacter: 1,
    endLine: 1,
    endCharacter: 33,
  },
  {
    file: CONTRACT_FIXTURE.sql,
    kind: "definition",
    query: "contract_records",
    resultKind: "table",
    line: 1,
    startCharacter: 1,
    endLine: 1,
    endCharacter: 42,
  },
  {
    file: CONTRACT_FIXTURE.sql,
    kind: "enum",
    query: "contract_state",
    resultKind: "enum",
    line: 2,
    startCharacter: 1,
    endLine: 2,
    endCharacter: 45,
  },
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
    async (expectation) => {
      const { kind, resultKind, query, line } = expectation;
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
      expectAstMatch(result, {
        file: CONTRACT_FIXTURE.contracts,
        name: query,
        kind: resultKind,
        line,
        startCharacter: expectation.startCharacter,
        endLine: expectation.endLine,
        endCharacter: expectation.endCharacter,
        ...("commonKind" in expectation
          ? { commonKind: expectation.commonKind, nativeKind: expectation.nativeKind }
          : {}),
      });
    },
    15_000,
  );

  it.each(PYTHON_AST_EXPECTATIONS)(
    "records the Python $kind support expectation",
    async (expectation) => {
      const outcome = await getWorkspace().session.find({
        query: expectation.query,
        mode: "ast",
        kind: expectation.kind,
        scope: [CONTRACT_FIXTURE.python],
      });

      if (expectation.supported) {
        const result = astResult(outcome);
        if ("resultKind" in expectation) {
          expectAstMatch(result, {
            file: CONTRACT_FIXTURE.python,
            name: expectation.query,
            kind: expectation.resultKind,
            line: expectation.line,
            startCharacter: expectation.startCharacter,
            endLine: expectation.endLine,
            endCharacter: expectation.endCharacter,
            ...("commonKind" in expectation
              ? { commonKind: expectation.commonKind, nativeKind: expectation.nativeKind }
              : {}),
          });
        } else {
          expect(result.matches).toEqual([]);
        }
        expect(result.partialReason).toBeNull();
        return;
      }

      expect(outcome).toMatchObject({
        kind: "invalid-input",
        message: expect.stringContaining("does not support the"),
      });
    },
  );

  it.each(TRANCHE_TWO_AST_EXPECTATIONS)(
    "finds $resultKind type evidence in $file",
    async (expectation) => {
      const { file, query, resultKind } = expectation;
      const result = astResult(
        await getWorkspace().session.find({ query, mode: "ast", kind: "type", scope: [file] }),
      );

      expectAstMatch(result, {
        file,
        name: query,
        kind: resultKind,
        line: 1,
        startCharacter: expectation.startCharacter,
        endLine: expectation.endLine,
        endCharacter: expectation.endCharacter,
        ...("commonKind" in expectation
          ? { commonKind: expectation.commonKind, nativeKind: expectation.nativeKind }
          : {}),
      });
      expect(result.partialReason).toBeNull();
      expect(result.scan.complete).toBe(true);
    },
  );

  it.each([...TRANCHE_THREE_AST_EXPECTATIONS, ...TRANCHE_FOUR_AST_EXPECTATIONS])(
    "finds $resultKind $kind evidence in $file",
    async (expectation) => {
      const { file, kind, query, resultKind, line } = expectation;
      const result = astResult(
        await getWorkspace().session.find({ query, mode: "ast", kind, scope: [file] }),
      );

      expectAstMatch(result, {
        file,
        name: query,
        kind: resultKind,
        line,
        startCharacter: expectation.startCharacter,
        endLine: expectation.endLine,
        endCharacter: expectation.endCharacter,
      });
      expect(result.partialReason).toBeNull();
      expect(result.scan.complete).toBe(true);
    },
  );

  it("prioritizes top-level file targets and reuses them through initial and warm readiness", async () => {
    const session = getWorkspace().session;
    const fileOutcome = await session.resolve({
      target: { file: CONTRACT_FIXTURE.contracts },
      maxResults: 6,
    });
    expect(fileOutcome.kind).toBe("target-group");
    if (fileOutcome.kind !== "target-group") throw new Error("Expected a Target group.");
    expect(fileOutcome.targets.map((target) => target.name)).toEqual([
      "ContractAlias",
      "Contract",
      "ContractState",
      "ContractWidget",
      "helper",
      "coordinateTarget",
    ]);
    expect(fileOutcome.targets.every((target) => target.container === null)).toBe(true);
    expect(fileOutcome.unknownNestingCount).toBe(0);
    expect(fileOutcome.omittedCount).toBeGreaterThan(0);

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

  it("distinguishes completed-empty, operation-ineligible, unsupported, and unavailable AST outcomes", async () => {
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

    const mixedWorkspace = astResult(
      await session.find({ query: "AbsentContractClass", mode: "ast", kind: "definition" }),
    );
    expect(mixedWorkspace.partialReason).toBeNull();
    expect(mixedWorkspace.scan).toMatchObject({ complete: true, limitations: [] });
    expect(mixedWorkspace.scan.exclusions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "unsupported-operation" })]),
    );

    const operationIneligible = await session.find({
      query: "accounting",
      mode: "ast",
      kind: "import",
      scope: [CONTRACT_FIXTURE.sql],
    });
    expect(operationIneligible).toMatchObject({
      kind: "invalid-input",
      message: expect.stringContaining("does not support the imports operation"),
    });

    await expect(
      session.find({
        query: "accounting",
        mode: "ast",
        kind: "import",
        scope: [CONTRACT_FIXTURE.sqlRoot],
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "No file in the requested scope supports AST import search.",
    });

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
    expect(inspection.data.sections.node).toMatchObject({
      kind: "completed",
      data: {
        text: "helper",
        startLine: 3,
        startCharacter: 10,
      },
    });
    expect(inspection.data.sections.definition).toMatchObject({
      data: expect.arrayContaining([
        {
          file: CONTRACT_FIXTURE.contracts,
          line: 12,
          character: 17,
        },
      ]),
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

function expectAstMatch(
  result: ReturnType<typeof astResult>,
  expected: {
    file: string;
    name: string;
    kind: string;
    line: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
    commonKind?: string;
    nativeKind?: string;
  },
): void {
  const match = result.matches.find(
    (candidate) =>
      candidate.file === expected.file &&
      candidate.name === expected.name &&
      candidate.kind === expected.kind &&
      candidate.line === expected.line,
  );
  expect(match, JSON.stringify(result.matches)).toBeDefined();
  expect(match).toMatchObject(expected);
}

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
