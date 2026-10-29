import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FileChangeType } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import { waitFor } from "../helpers/integration-utils.ts";
import {
  createRealLanguageWorkspace,
  type RealLanguageWorkspace,
} from "../helpers/real-substrate-workspace.ts";
import { type DiagnosticFixMessage, waitForDiagnosticFix } from "./diagnostic-fix-observation.ts";
import type { LanguageCase } from "./language-cases.ts";

interface PublicToolResult {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly details: {
    readonly status?: string;
    readonly data: unknown;
    readonly displaySections?: readonly {
      readonly key: string;
      readonly lines: readonly string[];
    }[];
  };
}

interface ToolContext {
  readonly workspace: RealLanguageWorkspace;
  readonly pi: ReturnType<typeof createPiMock>;
  readonly context: ReturnType<typeof makeCtx>;
}

interface TargetInfo {
  readonly targetId: string;
  readonly name: string | null;
  readonly provenance: readonly string[];
}

export function registerLanguageBaselineCase(spec: LanguageCase): void {
  describe(`${spec.label} real-server acceptance`, () => {
    let setup: ToolContext;
    let target: TargetInfo;

    beforeAll(async () => {
      const workspace = await createRealLanguageWorkspace(spec);
      setup = createToolContext(workspace);
      target = await resolveTarget(setup, spec.sourceFile, spec.renameName);
      await waitForInspectionReadiness(setup, spec);
    }, 90_000);

    afterAll(async () => {
      await setup?.workspace.dispose();
    });

    it("inspects a source point", async () => assertInspection(setup, spec), 30_000);
    it("lists document symbols", async () => assertDocumentSymbols(setup, spec), 30_000);
    it("finds references", async () => assertReferences(setup, spec), 30_000);
    it("finds implementations", async () => assertImplementations(setup, spec), 30_000);
    it("searches structural imports", async () => assertStructuralSearch(setup, spec), 30_000);
    it("finds direct and deep callees", async () => assertCallees(setup, spec), 30_000);
    it(
      "reports diagnostic changes and freshness",
      async () => assertDiagnostics(setup, spec),
      60_000,
    );
    it("finds workspace symbols", async () => assertSemanticSearch(setup, spec), 30_000);
    if (spec.typescriptInstallation && spec.language === "typescript") {
      it("plans and applies precise organize-import edits through public tools", async () => {
        const file = join(setup.workspace.cwd, "src/organize.ts");
        const original =
          'import { zeta } from "./imports";\nimport { alpha } from "./imports";\nexport const organized = zeta + alpha;\n';
        writeFileSync(
          join(setup.workspace.cwd, "src/imports.ts"),
          "export const alpha = 1;\nexport const zeta = 2;\n",
        );
        writeFileSync(file, original);
        const plan = await runTool(setup, "code_refactor_plan", {
          target: { anchor: { file, line: 3, character: 14 } },
          operation: { update_imports: {} },
        });
        expect(plan.details.status, displayText(plan)).toBe("completed");
        expect(readFileSync(file, "utf8")).toBe(original);
        const applied = await runTool(setup, "code_refactor_apply", {
          planId: extractPlanId(plan),
        });
        expect(applied.details.status, displayText(applied)).toBe("completed");
        expect(readFileSync(file, "utf8")).toBe(
          'import { alpha, zeta } from "./imports";\nexport const organized = zeta + alpha;\n',
        );
      }, 30_000);
    }
    if (spec.typescriptInstallation === "@typescript/native" && spec.language === "typescript") {
      it("reports native unused-import actions unavailable rather than inventing an edit (#554)", async () => {
        const file = join(setup.workspace.cwd, "src/unused.ts");
        const original = 'import { renameMe } from "./model";\nexport const unusedControl = 1;\n';
        writeFileSync(file, original);
        await expect(
          runTool(setup, "code_refactor_plan", {
            target: { anchor: { file, line: 2, character: 14 } },
            operation: { delete_dead_code: {} },
          }),
        ).rejects.toThrow("The server does not advertise the requested code-action kind.");
        expect(readFileSync(file, "utf8")).toBe(original);
      }, 30_000);
    }
    it("plans and applies exact renames, then rejects stale plans", async () => {
      await assertRenameAndStalePlan(setup, spec, target);
    }, 60_000);
  });
}

async function resolveTarget(
  setup: ToolContext,
  relativeFile: string,
  symbol: string,
): Promise<TargetInfo> {
  const file = resolve(setup.workspace.cwd, relativeFile);
  const point = findPoint(readFileSync(file, "utf8"), symbol, 0);
  const result = await runTool(setup, "code_resolve", {
    target: { anchor: { file, line: point.line, character: point.character } },
  });
  const data = resultData<{ resultKind: string; targets: TargetInfo[] }>(result);
  expect(data.resultKind, `${displayText(result)}\n${JSON.stringify(data)}`).toBe("resolved");
  const target = data.targets[0];
  expect(target, `No semantic target resolved for ${symbol} in ${relativeFile}`).toBeDefined();
  if (!target) throw new Error(`No semantic target resolved for ${symbol} in ${relativeFile}.`);
  expect(target.name).toBe(symbol);
  expect(target.provenance.length).toBeGreaterThan(0);
  return target;
}

async function assertDocumentSymbols(setup: ToolContext, spec: LanguageCase): Promise<void> {
  // The TS backend qualification must not pass on structural-only fallback.
  if (spec.typescriptInstallation) setup.workspace.disableStructural();
  try {
    const result = await runTool(setup, "code_resolve", {
      target: { file: resolve(setup.workspace.cwd, spec.sourceFile) },
    });
    const data = resultData<{
      resultKind: string;
      targets: TargetInfo[];
      groupPartialReason: string | null;
    }>(result);
    expect(data.resultKind).toBe("target-group");
    expect(data.targets.some((target) => target.name === spec.renameName)).toBe(true);
    expect(data.targets.every((target) => target.provenance.length > 0)).toBe(true);
    if (spec.typescriptInstallation) {
      expect(data.targets.find((target) => target.name === spec.renameName)?.provenance).toContain(
        "semantic",
      );
      expect(data.groupPartialReason).toBeNull();
    }
  } finally {
    if (spec.typescriptInstallation) setup.workspace.enableStructural();
  }
}

async function assertSemanticSearch(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const query = spec.semanticQuery ?? spec.renameName;
  const result = await runTool(setup, "code_find", {
    query,
    mode: "semantic",
  });
  const data = resultData<{
    candidateCount: number;
    evidenceLists: Array<{ shownCount: number; totalCount: number | null }>;
  }>(result);
  expect(data.candidateCount).toBeGreaterThan(0);
  expect(data.evidenceLists[0]?.shownCount).toBeGreaterThan(0);
  expect(displayText(result)).toContain(query);
}

// Route readiness on sourceFile does not establish that a different file's
// reference is indexed. Warm the exact fixture point before its one-shot test.
async function waitForInspectionReadiness(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const file = resolve(setup.workspace.cwd, spec.inspectFile);
  const point = findPoint(readFileSync(file, "utf8"), spec.renameName, spec.inspectOccurrence);
  const position = { line: point.line - 1, character: point.character - 1 };
  const control = { deadline: Date.now() + 20_000 };
  const runtime = setup.workspace.lspRuntime;
  await waitFor(
    () =>
      Promise.all([
        runtime.hover(file, position, control),
        runtime.definition(file, position, control),
      ]),
    ([hover, definition]) =>
      hover.kind === "completed" &&
      hover.data !== null &&
      definition.kind === "completed" &&
      definition.data !== null &&
      (!Array.isArray(definition.data) || definition.data.length > 0),
    {
      timeoutMs: 20_000,
      retryDelayMs: 100,
      label: `${spec.label} inspection reference in ${spec.inspectFile}`,
    },
  );
}

async function assertInspection(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const file = resolve(setup.workspace.cwd, spec.inspectFile);
  const point = findPoint(readFileSync(file, "utf8"), spec.renameName, spec.inspectOccurrence);
  const result = await runTool(setup, "code_inspect", {
    point: { file, line: point.line, character: point.character },
  });
  const data = resultData<{
    sections: readonly {
      key: string;
      status: string;
      itemCount: number;
      confidence: string;
      provenance: readonly { source: string }[];
    }[];
  }>(result);
  for (const key of ["node", "hover", "definition"]) {
    const section = data.sections.find((entry) => entry.key === key);
    expect(section?.status, `${key}: ${displayText(result)}\n${JSON.stringify(data)}`).toBe(
      "complete",
    );
    expect(
      section?.itemCount,
      `${key}: ${displayText(result)}\n${JSON.stringify(data)}`,
    ).toBeGreaterThan(0);
  }
  expect(data.sections.find((entry) => entry.key === "hover")?.confidence).toBe("semantic");
  expect(data.sections.find((entry) => entry.key === "definition")?.provenance).toContainEqual({
    source: "semantic",
    capability: "LSP",
  });
  expect(displayText(result)).toContain(spec.renameName);
  expect(displayText(result)).toContain(spec.sourceFile);
}

async function assertReferences(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const file = resolve(setup.workspace.cwd, spec.sourceFile);
  const point = findPoint(readFileSync(file, "utf8"), spec.renameName, 0);
  const result = await runTool(setup, "code_graph", {
    target: { anchor: { file, line: point.line, character: point.character } },
    relations: ["references"],
  });
  const data = resultData<{
    sections: Array<{ rel: string; status: string; fileGroups?: readonly { file: string }[] }>;
    evidenceLists: readonly { key: string; totalCount: number | null }[];
  }>(result);
  const section = data.sections.find((entry) => entry.rel === "references");
  expect(section?.status).not.toBe("unavailable");
  expect(
    data.evidenceLists.find((list) => list.key === "references.locations")?.totalCount,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(section?.fileGroups)).toContain(basename(spec.inspectFile));
}

async function assertImplementations(setup: ToolContext, spec: LanguageCase): Promise<void> {
  if ("notApplicableReason" in spec.implementation) {
    expect(spec.implementation.notApplicableReason).toContain("C has no language-defined");
    return;
  }
  const file = resolve(setup.workspace.cwd, spec.implementation.file);
  const point = findPoint(readFileSync(file, "utf8"), spec.implementation.symbol, 0);
  const result = await runTool(setup, "code_graph", {
    target: { anchor: { file, line: point.line, character: point.character } },
    relations: ["implements"],
  });
  const data = resultData<{
    sections: Array<{ rel: string; status: string; fileGroups?: readonly { file: string }[] }>;
    evidenceLists: readonly { key: string; totalCount: number | null }[];
  }>(result);
  const section = data.sections.find((entry) => entry.rel === "implements");
  expect(section?.status).not.toBe("unavailable");
  expect(
    data.evidenceLists.find((list) => list.key === "implements.locations")?.totalCount,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(section?.fileGroups)).toContain(spec.implementation.expectedFile);
}

async function assertStructuralSearch(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const imports = await runTool(setup, "code_find", {
    query: spec.importQuery,
    mode: "ast",
    kind: "import",
  });
  const importData = resultData<{ astMatches: readonly { name: string; kind: string }[] }>(imports);
  expect(importData.astMatches.some((match) => match.kind === "import")).toBe(true);
  expect(importData.astMatches.some((match) => match.name.includes(spec.importQuery))).toBe(true);

  const calls = await runTool(setup, "code_find", {
    query: spec.renameName,
    mode: "ast",
    kind: "call",
  });
  const callData = resultData<{ astMatches: readonly { name: string; kind: string }[] }>(calls);
  expect(
    callData.astMatches.some(
      (match) => match.kind === "call" && match.name.includes(spec.renameName),
    ),
  ).toBe(true);
}

async function assertCallees(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const file = resolve(setup.workspace.cwd, spec.calleeFile);
  const point = findPoint(readFileSync(file, "utf8"), spec.calleeSymbol, 0);
  for (const depth of ["direct", "deep"] as const) {
    const result = await runTool(setup, "code_graph", {
      target: { anchor: { file, line: point.line, character: point.character } },
      relations: ["callees"],
      calleeDepth: depth,
    });
    const data = resultData<{
      sections: Array<{ rel: string; status: string; depth: string | null }>;
      evidenceLists: readonly { key: string; totalCount: number | null }[];
    }>(result);
    const section = data.sections.find((entry) => entry.rel === "callees");
    expect(section?.status).toBe("complete");
    expect(section?.depth).toBe(depth);
    const calls = displayText(result);
    const expected = depth === "direct" ? spec.expectedDirectCalls : spec.expectedDeepCalls;
    for (const name of expected) expect(calls).toContain(name);
    const count = data.evidenceLists.find((list) => list.key === "callees.calls")?.totalCount;
    const expectedCount = spec.expectedCallCounts?.[depth];
    if (expectedCount === undefined) expect(count).toBeGreaterThan(0);
    else expect(count).toBe(expectedCount);
  }
}

async function assertDiagnostics(setup: ToolContext, spec: LanguageCase): Promise<void> {
  const file = resolve(setup.workspace.cwd, spec.errorFile);
  const originalSource = readFileSync(file, "utf8");
  expect(originalSource).toContain(spec.errorText);
  expect(originalSource).not.toContain(spec.diagnosticControl.marker);
  const sourceWithControl = replaceExactlyOnce(
    originalSource,
    spec.diagnosticControl.insertAfter,
    `${spec.diagnosticControl.insertAfter}${spec.diagnosticControl.source}`,
  );
  writeFileSync(file, sourceWithControl);
  const errorLine = findPoint(sourceWithControl, spec.errorText, 0).line;
  const controlLine = findPoint(sourceWithControl, spec.diagnosticControl.marker, 0).line;
  noteDiagnosticWrite(setup, file);

  const firstData = await waitForKnownDiagnostics(setup, spec, file, {
    error: errorLine,
    control: controlLine,
  });
  assertDiagnosticScope(firstData, file);
  expect(["completed", "partial"]).toContain(firstData.diagnosticObservation.kind);
  assertDiagnosticFreshness(firstData.diagnosticObservation);
  if (spec.typescriptInstallation) expect(firstData.diagnosticObservation.kind).toBe("completed");
  expect(firstData.refresh.kind).toBe("completed");
  expect(firstData.refresh.fileReadiness).toBe("ready");

  const knownErrors = knownErrorMessages(firstData, file, errorLine);
  const controlErrors = knownErrorMessages(firstData, file, controlLine);
  expect(knownErrors.length).toBeGreaterThan(0);
  expect(controlErrors.length).toBeGreaterThan(0);
  const sourceWithPrimaryFixed = replaceExactlyOnce(
    sourceWithControl,
    spec.errorText,
    spec.fixedText,
  );
  writeFileSync(file, sourceWithPrimaryFixed);
  noteDiagnosticWrite(setup, file);
  const changed = await waitForDiagnosticFix({
    observe: async () => resultData<HealthData>(await healthFor(setup, file)),
    file,
    previous: knownErrors,
    control: controlErrors,
    timeoutMs: 20_000,
    pollIntervalMs: 250,
  });
  assertDiagnosticScope(changed, file);
  expect(["completed", "partial"]).toContain(changed.diagnosticObservation.kind);
  expect(knownErrorMessages(changed, file, errorLine)).toEqual([]);
  expect(knownErrorMessages(changed, file, controlLine)).toEqual(
    expect.arrayContaining(controlErrors),
  );
  expect(changed.refresh.kind).toBe("completed");
  expect(changed.refresh.fileReadiness).toBe("ready");
  assertChangedDiagnosticFreshness(changed.diagnosticObservation);
  if (spec.typescriptInstallation) expect(changed.diagnosticObservation.kind).toBe("completed");

  const sourceWithoutControl = replaceExactlyOnce(
    sourceWithPrimaryFixed,
    spec.diagnosticControl.source,
    "",
  );
  expect(sourceWithoutControl).not.toContain(spec.diagnosticControl.marker);
  writeFileSync(file, sourceWithoutControl);
  noteDiagnosticWrite(setup, file);
  const finalData = resultData<HealthData>(await healthFor(setup, file));
  assertDiagnosticScope(finalData, file);
  assertTruthfulFinalDiagnosticState(finalData.diagnosticObservation);
  if (spec.typescriptInstallation) expect(finalData.diagnosticObservation.kind).toBe("completed");
  expect(finalData.refresh.kind).toBe("completed");
  expect(finalData.refresh.fileReadiness).toBe("ready");
}

interface DiagnosticObservation {
  readonly kind: "completed" | "partial" | "unavailable";
  readonly scope: { readonly kind: string; readonly path: string };
  readonly entries: readonly {
    readonly file: string;
    readonly errors: number;
    readonly messages?: readonly DiagnosticFixMessage[];
  }[];
  readonly evidence: {
    readonly requested: number;
    readonly confirmed: number;
    readonly unconfirmed: number;
    readonly failed: number;
  };
  readonly reason?: string;
}

interface HealthData {
  readonly semanticState: { readonly kind: string } | null;
  readonly diagnosticObservation: DiagnosticObservation;
  readonly serverInventoryScope: string;
  readonly refresh: {
    readonly kind: string;
    readonly fileReadiness?: string;
    readonly requestedDiagnosticScope: { readonly kind: string; readonly path: string };
  };
}

async function waitForKnownDiagnostics(
  setup: ToolContext,
  spec: LanguageCase,
  file: string,
  lines: { readonly error: number; readonly control: number },
): Promise<HealthData> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const latest = resultData<HealthData>(await healthFor(setup, file));
    const hasObservation =
      latest.diagnosticObservation.kind === "completed" ||
      latest.diagnosticObservation.kind === "partial";
    if (
      hasObservation &&
      knownErrorMessages(latest, file, lines.error).length > 0 &&
      knownErrorMessages(latest, file, lines.control).length > 0
    ) {
      return latest;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`${spec.label} did not report both fixture diagnostics within 20 seconds.`);
}

function knownErrorMessages(data: HealthData, file: string, line: number): DiagnosticFixMessage[] {
  return (
    data.diagnosticObservation.entries
      .find((entry) => entry.file === file)
      ?.messages?.filter((message) => message.line === line && message.severity === "error") ?? []
  );
}

function noteDiagnosticWrite(setup: ToolContext, file: string): void {
  setup.workspace.lspRuntime.noteWorkspaceWrites([
    { uri: pathToFileURL(file).href, type: FileChangeType.Changed },
  ]);
}

function assertDiagnosticScope(data: HealthData, file: string): void {
  expect(data.semanticState?.kind).toBe("ready");
  expect(data.diagnosticObservation.scope).toMatchObject({ kind: "file", path: file });
  expect(data.refresh.requestedDiagnosticScope).toMatchObject({ kind: "file", path: file });
  expect(data.serverInventoryScope).toBe("workspace");
}

function assertDiagnosticFreshness(observation: DiagnosticObservation): void {
  if (observation.kind === "completed") {
    expect(observation.evidence.confirmed).toBeGreaterThan(0);
    return;
  }
  expect(observation.reason).toBeTruthy();
  expect(observation.evidence.confirmed).toBe(0);
  expect(observation.evidence.unconfirmed).toBeGreaterThan(0);
}

function assertChangedDiagnosticFreshness(observation: DiagnosticObservation): void {
  expect(observation.entries.some((entry) => entry.errors > 0)).toBe(true);
  if (observation.kind === "completed") {
    expect(observation.evidence).toMatchObject({
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
    });
    return;
  }
  expect(observation.kind).toBe("partial");
  expect(observation.reason).toBeTruthy();
  expect(observation.evidence).toMatchObject({ requested: 1, confirmed: 0 });
  expect(observation.evidence.unconfirmed + observation.evidence.failed).toBeGreaterThan(0);
}

function assertTruthfulFinalDiagnosticState(observation: DiagnosticObservation): void {
  expect(observation.evidence.requested).toBe(1);
  if (observation.kind === "completed") {
    expect(observation.evidence).toMatchObject({
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
    });
    expect(observation.entries.every((entry) => entry.errors === 0)).toBe(true);
    expect(
      observation.entries.every(
        (entry) => !entry.messages?.some((message) => message.severity === "error"),
      ),
    ).toBe(true);
    return;
  }
  expect(observation.reason).toBeTruthy();
  expect(observation.evidence.confirmed).toBe(0);
  expect(observation.evidence.unconfirmed + observation.evidence.failed).toBeGreaterThan(0);
}

function replaceExactlyOnce(source: string, search: string, replacement: string): string {
  const index = source.indexOf(search);
  if (index < 0 || source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Expected one occurrence of ${JSON.stringify(search)} in the fixture source.`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

async function healthFor(setup: ToolContext, file: string): Promise<PublicToolResult> {
  return runTool(setup, "code_health", {
    scope: file,
    include: ["diagnostics"],
    refresh: true,
    level: "detailed",
  });
}

async function assertRenameAndStalePlan(
  setup: ToolContext,
  spec: LanguageCase,
  initialTarget: TargetInfo,
): Promise<void> {
  const before = new Map(
    spec.renameFiles.map((file) => [file, readFileSync(join(setup.workspace.cwd, file), "utf8")]),
  );
  const staleName = spec.language === "go" ? "StaleName" : "staleName";
  const stale = await planRename(setup, initialTarget.targetId, staleName);
  const staleId = extractPlanId(stale);
  const plan = await planRename(setup, initialTarget.targetId, spec.newName);
  const lines = plan.details.displaySections?.flatMap((section) => section.lines) ?? [];
  expect([...lines].sort((left, right) => left.localeCompare(right))).toEqual(
    expectedRenameLines(setup, spec, spec.renameName, spec.newName),
  );
  for (const [file, source] of before)
    expect(readFileSync(join(setup.workspace.cwd, file), "utf8")).toBe(source);

  const planId = extractPlanId(plan);
  const applied = await runTool(setup, "code_refactor_apply", { planId });
  expect(applied.details.status).toBe("completed");
  for (const [file, source] of before) {
    expect(readFileSync(join(setup.workspace.cwd, file), "utf8")).toBe(
      source.replaceAll(spec.renameName, spec.newName),
    );
  }

  const rejected = await runTool(setup, "code_refactor_apply", { planId: staleId });
  expect(rejected.details.status).toBe("invalid-input");
  expect(displayText(rejected)).toContain("changed since the plan was generated");
}

async function planRename(
  setup: ToolContext,
  targetId: string,
  newName: string,
): Promise<PublicToolResult> {
  return runTool(setup, "code_refactor_plan", {
    target: { handle: targetId },
    operation: { rename_symbol: { newName } },
  });
}

function expectedRenameLines(
  setup: ToolContext,
  spec: LanguageCase,
  oldName: string,
  newName: string,
): string[] {
  const expected = spec.renameFiles.flatMap((relativeFile) => {
    const file = realpathSync(join(setup.workspace.cwd, relativeFile));
    const source = readFileSync(file, "utf8");
    return allOccurrences(source, oldName).map((index) => {
      const prefix = source.slice(0, index);
      const line = prefix.split("\n").length;
      const character = prefix.length - prefix.lastIndexOf("\n");
      return `${file} L${line}:${character} → L${line}:${character + oldName.length}: ${newName}`;
    });
  });
  return expected.sort((left, right) => left.localeCompare(right));
}

function allOccurrences(source: string, needle: string): number[] {
  const positions: number[] = [];
  for (
    let offset = source.indexOf(needle);
    offset >= 0;
    offset = source.indexOf(needle, offset + needle.length)
  ) {
    positions.push(offset);
  }
  return positions;
}

function extractPlanId(result: PublicToolResult): string {
  const data = resultData<{ nextQueries: readonly string[] }>(result);
  const id = /planId: "([^"]+)"/u.exec(data.nextQueries.join("\n"))?.[1];
  if (!id) {
    throw new Error(
      `The public code_refactor_plan result has no plan ID: ${JSON.stringify(result.details)}`,
    );
  }
  return id;
}

function findPoint(
  source: string,
  token: string,
  occurrence: number,
): { line: number; character: number } {
  const positions = allOccurrences(source, token);
  const position = positions[occurrence];
  if (position === undefined) throw new Error(`No occurrence ${occurrence} of ${token} exists.`);
  const prefix = source.slice(0, position);
  const line = prefix.split("\n").length;
  return { line, character: prefix.length - prefix.lastIndexOf("\n") };
}

function createToolContext(workspace: RealLanguageWorkspace): ToolContext {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => workspace.session);
  return { workspace, pi, context: makeCtx({ cwd: workspace.cwd }) };
}

async function runTool(
  setup: ToolContext,
  name: string,
  input: unknown,
): Promise<PublicToolResult> {
  const tool = getTool(setup.pi, name);
  return (await tool.execute(
    `language-baseline-${name}`,
    input,
    undefined,
    undefined,
    setup.context,
  )) as PublicToolResult;
}

function resultData<T>(result: PublicToolResult): T {
  if (typeof result.details?.data !== "object" || result.details.data === null) {
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
