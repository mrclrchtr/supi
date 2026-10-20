import { accessSync, constants, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import {
  createRealCFamilyAssociationWorkspace,
  type ProtocolRecord,
  type RealCFamilyAssociationWorkspace,
  readProtocolLog,
} from "../helpers/real-c-family-association-workspace.ts";

interface PublicToolResult {
  readonly content: readonly { readonly text?: string }[];
  readonly details: {
    readonly status?: string;
    readonly data: unknown;
    readonly displaySections?: readonly { readonly lines: readonly string[] }[];
  };
}

interface AstMatch {
  readonly file: string;
  readonly name: string;
  readonly kind: string;
  readonly nativeKind?: string;
}

interface TargetInfo {
  readonly targetId: string;
  readonly name: string | null;
  readonly provenance: readonly string[];
}

const FIXTURES = {
  firstMatch: "vendor/sdk/first_match.h",
  configuredCpp: "include/cpp/configured.h",
  defaultC: "include/default/default.h",
  cSource: "src/c_main.c",
  cppSource: "src/cpp_main.cpp",
} as const;

describe("trusted C-family associations with real clangd", () => {
  let workspace: RealCFamilyAssociationWorkspace;
  const pi = createPiMock();
  let ctx: ReturnType<typeof makeCtx>;

  beforeAll(async () => {
    const clangd = process.env.CODE_BASELINE_CLANGD_SERVER ?? findExecutable("clangd");
    if (!clangd) throw new Error("clangd is required for C-family association acceptance.");
    workspace = await createRealCFamilyAssociationWorkspace(clangd);
    ctx = makeCtx({ cwd: workspace.cwd, isProjectTrusted: () => true });
    registerCodeIntelligenceTools(pi as never, () => workspace.session);
  }, 90_000);

  afterAll(async () => {
    await workspace?.dispose();
  });

  it("keeps the configured C server route", async () => {
    const runtime = workspace.lease.lspController?.workspaceRuntime;
    if (!runtime) throw new Error("The shared C-family LSP runtime is not ready.");
    const runningServers = runtime
      .getProjectServers()
      .filter((server) => server.status === "running")
      .map((server) => server.name);
    expect(runningServers).toEqual(["c"]);
  });

  it("uses native C and C++ grammar results for trusted header rules", async () => {
    const firstMatch = await searchAst(FIXTURES.firstMatch, "FirstMatchC", "type");
    expect(firstMatch).toMatchObject({ name: "FirstMatchC", kind: "struct", nativeKind: "struct" });

    const configuredCpp = await searchAst(FIXTURES.configuredCpp, "CppOnly", "class");
    expect(configuredCpp).toMatchObject({ name: "CppOnly", kind: "class", nativeKind: "class" });

    const defaultC = await searchAst(FIXTURES.defaultC, "DefaultC", "type");
    expect(defaultC).toMatchObject({ name: "DefaultC", kind: "struct", nativeKind: "struct" });
  });

  it("returns positive semantic resolution and reference evidence", async () => {
    await assertSemanticReferences(FIXTURES.cSource, "first_match_value", FIXTURES.firstMatch);
    await assertSemanticReferences(FIXTURES.cppSource, "cpp_value", FIXTURES.configuredCpp);
    await assertSemanticReferences(FIXTURES.cSource, "default_value", FIXTURES.defaultC);
  }, 60_000);

  it("inspects each associated header with real semantic evidence", async () => {
    await assertHeaderInspection(FIXTURES.firstMatch, "first_match_value");
    await assertHeaderInspection(FIXTURES.configuredCpp, "cpp_value");
    await assertHeaderInspection(FIXTURES.defaultC, "default_value");
  }, 60_000);

  it("sends real didOpen language IDs for associated and default headers", async () => {
    const expected = [
      expectedDidOpen(workspace.cwd, FIXTURES.firstMatch, "c"),
      expectedDidOpen(workspace.cwd, FIXTURES.configuredCpp, "cpp"),
      expectedDidOpen(workspace.cwd, FIXTURES.defaultC, "c"),
      expectedDidOpen(workspace.cwd, FIXTURES.cSource, "c"),
      expectedDidOpen(workspace.cwd, FIXTURES.cppSource, "cpp"),
    ];
    await waitForProtocolRecords(expected);

    const records = readProtocolLog(workspace.protocolLogPath);
    expect(records).toEqual(expect.arrayContaining(expected));
    expect(records.every((record) => Object.keys(record).every(isAllowedProtocolField))).toBe(true);
    expect(readFileSync(workspace.protocolLogPath, "utf8")).not.toContain(
      "first_match_value(int value)",
    );
  });

  async function searchAst(file: string, name: string, kind: "type" | "class"): Promise<AstMatch> {
    const result = await runTool("code_find", {
      query: name,
      mode: "ast",
      kind,
      scope: [resolve(workspace.cwd, file)],
    });
    const matches = resultData<{ astMatches: readonly AstMatch[] }>(result).astMatches;
    const match = matches.find((candidate) => candidate.name === name);
    expect(match, `No native ${kind} result exists for ${name} in ${file}.`).toBeDefined();
    if (!match) throw new Error(`No native ${kind} result exists for ${name} in ${file}.`);
    return match;
  }

  async function assertHeaderInspection(file: string, name: string): Promise<void> {
    const absoluteFile = resolve(workspace.cwd, file);
    const point = findPoint(readFileSync(absoluteFile, "utf8"), name);
    const result = await runTool("code_inspect", {
      point: { file: absoluteFile, ...point },
    });
    const data = resultData<{
      readonly sections: readonly {
        readonly key: string;
        readonly status: string;
        readonly itemCount: number;
      }[];
    }>(result);
    for (const key of ["hover", "definition"]) {
      const section = data.sections.find((entry) => entry.key === key);
      expect(section?.status).toBe("complete");
      expect(section?.itemCount).toBeGreaterThan(0);
    }
  }

  async function assertSemanticReferences(file: string, name: string, expectedFile: string) {
    const absoluteFile = resolve(workspace.cwd, file);
    const point = findPoint(readFileSync(absoluteFile, "utf8"), name);
    const resolution = await runTool("code_resolve", {
      target: { anchor: { file: absoluteFile, ...point } },
    });
    const target = resultData<{ resultKind: string; targets: TargetInfo[] }>(resolution).targets[0];
    expect(resultData<{ resultKind: string }>(resolution).resultKind).toBe("resolved");
    expect(target?.name).toBe(name);
    expect(target?.provenance.length).toBeGreaterThan(0);
    if (!target) throw new Error(`No semantic target resolved for ${name}.`);

    const graph = await runTool("code_graph", {
      target: { handle: target.targetId },
      relations: ["references"],
    });
    const data = resultData<{
      readonly sections: readonly { readonly rel: string; readonly status: string }[];
      readonly evidenceLists: readonly {
        readonly key: string;
        readonly totalCount: number | null;
      }[];
    }>(graph);
    expect(data.sections.find((section) => section.rel === "references")?.status).not.toBe(
      "unavailable",
    );
    expect(
      data.evidenceLists.find((list) => list.key === "references.locations")?.totalCount,
    ).toBeGreaterThan(0);
    expect(displayText(graph)).toContain(expectedFile);
  }

  async function runTool(name: string, input: unknown): Promise<PublicToolResult> {
    const tool = getTool(pi, name);
    return (await tool.execute(
      `c-family-${name}`,
      input,
      undefined,
      undefined,
      ctx,
    )) as PublicToolResult;
  }

  async function waitForProtocolRecords(expected: readonly ProtocolRecord[]): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const records = readProtocolLog(workspace.protocolLogPath);
      if (expected.every((wanted) => records.some((record) => matchesRecord(record, wanted)))) {
        return;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
    throw new Error(
      `clangd did not record every expected didOpen document ID and language ID: ${JSON.stringify(
        readProtocolLog(workspace.protocolLogPath),
      )}`,
    );
  }
});

function expectedDidOpen(cwd: string, relativeFile: string, languageId: string): ProtocolRecord {
  return {
    method: "textDocument/didOpen",
    documentId: pathToFileURL(resolve(cwd, relativeFile)).href,
    languageId,
  };
}

function matchesRecord(record: ProtocolRecord, expected: ProtocolRecord): boolean {
  return (
    record.method === expected.method &&
    record.documentId === expected.documentId &&
    record.languageId === expected.languageId
  );
}

function isAllowedProtocolField(key: string): boolean {
  return key === "method" || key === "documentId" || key === "languageId";
}

function resultData<T>(result: PublicToolResult): T {
  if (typeof result.details.data !== "object" || result.details.data === null) {
    throw new Error("The public code tool returned no structured data.");
  }
  return result.details.data as T;
}

function displayText(result: PublicToolResult): string {
  return [
    ...result.content.map((item) => item.text ?? ""),
    ...(result.details.displaySections?.flatMap((section) => section.lines) ?? []),
  ].join("\n");
}

function findPoint(source: string, token: string): { line: number; character: number } {
  const offset = source.indexOf(token);
  if (offset < 0) throw new Error(`The fixture does not contain ${token}.`);
  const prefix = source.slice(0, offset);
  return {
    line: prefix.split("\n").length,
    character: prefix.length - prefix.lastIndexOf("\n"),
  };
}

function findExecutable(command: string): string | undefined {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = resolve(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next PATH directory.
    }
  }
  return undefined;
}
