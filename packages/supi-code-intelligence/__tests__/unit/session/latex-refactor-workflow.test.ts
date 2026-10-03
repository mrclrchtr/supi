import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  RefactorResult,
  SemanticProvider,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import type { RefactorPlan } from "../../../src/session/refactor-plans.ts";
import {
  type RefactorWorkflowDeps,
  runRefactorApplyWorkflow,
  runRefactorPlanWorkflow,
} from "../../../src/session/refactor-workflow.ts";
import {
  computeFileFingerprint,
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";
import { assembleRefactorApplyDetails } from "../../../src/tool/result/refactor.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

const UNSUPPORTED_RENAME_REASON =
  "LSP request textDocument/rename failed: Rename is unavailable at the requested position.";

let tempRoot: string;
let treeSitter: ReturnType<typeof createTreeSitterSession> | undefined;

afterEach(async () => {
  await treeSitter?.dispose();
  treeSitter = undefined;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

describe("LaTeX section rename workflow", () => {
  it.each(["nested", "external"] as const)(
    "uses the routed %s root and applies repeated punctuated-title renames",
    async (routeKind) => {
      const fixture = createFixture(routeKind);
      treeSitter = createTreeSitterSession(fixture.cwd);
      const structural = createTreeSitterProvider(treeSitter);
      const deps = createDeps(fixture, structural, {
        kind: "unavailable",
        reason: UNSUPPORTED_RENAME_REASON,
        authorizedMutationRoots: [fixture.routedRoot],
      });
      const expectedRoot = realpathSync(fixture.routedRoot);

      await runRenameCycle(deps, fixture, "Intro, overview", "Overview, details");
      expect(readFileSync(fixture.file, "utf8")).toBe(
        String.raw`\section*[Short]{  Overview, details  }`,
      );
      const secondPlan = await runRenameCycle(
        deps,
        fixture,
        "Overview, details",
        "Conclusion, summary",
      );

      expect(secondPlan.authorizedMutationRoots).toEqual([expectedRoot]);
      expect(readFileSync(fixture.file, "utf8")).toBe(
        String.raw`\section*[Short]{  Conclusion, summary  }`,
      );
    },
  );

  it("does not plan against an outline after the source changes during inspection", async () => {
    const fixture = createFixture("nested");
    const original = String.raw`\section{Intro}`;
    writeFileSync(fixture.file, original);
    treeSitter = createTreeSitterSession(fixture.cwd);
    const base = createTreeSitterProvider(treeSitter);
    const structural: StructuralProvider = {
      ...base,
      outline: async (file, control) => {
        const result = await base.outline(file, control);
        writeFileSync(fixture.file, String.raw`\section{Introduction}`);
        return result;
      },
    };
    const plans = new Map<string, RefactorPlan>();
    const deps = createDeps(
      fixture,
      structural,
      {
        kind: "unavailable",
        reason: UNSUPPORTED_RENAME_REASON,
        authorizedMutationRoots: [fixture.routedRoot],
      },
      plans,
    );
    const target = registerSectionTarget(fixture, deps.targetStore, "Intro");

    const outcome = await runRefactorPlanWorkflow(
      {
        target: { handle: target.targetId },
        operation: { rename_symbol: { newName: "Overview" } },
      },
      deps,
    );

    expect(outcome).toMatchObject({
      kind: "unavailable",
      reason: "The LaTeX source changed while Tree-sitter checked the section.",
    });
    expect(plans.size).toBe(0);
    expect(readFileSync(fixture.file, "utf8")).toBe(String.raw`\section{Introduction}`);
    expect(readFileSync(fixture.file, "utf8")).not.toContain("Overviewduction");
  });

  it("blocks the fallback when the routed result has no mutation authority", async () => {
    const fixture = createFixture("nested");
    treeSitter = createTreeSitterSession(fixture.cwd);
    const plans = new Map<string, RefactorPlan>();
    const deps = createDeps(
      fixture,
      createTreeSitterProvider(treeSitter),
      { kind: "unavailable", reason: UNSUPPORTED_RENAME_REASON },
      plans,
    );
    const target = registerSectionTarget(fixture, deps.targetStore, "Intro, overview");

    const outcome = await runRefactorPlanWorkflow(
      {
        target: { handle: target.targetId },
        operation: { rename_symbol: { newName: "Overview" } },
      },
      deps,
    );

    expect(outcome).toMatchObject({
      kind: "unavailable",
      reason: "The routed LSP client did not authorize a mutation root for this title edit.",
    });
    expect(plans.size).toBe(0);
  });
});

async function runRenameCycle(
  deps: RefactorWorkflowDeps & { readonly targetStore: Map<string, TargetStoreEntry> },
  fixture: Fixture,
  oldName: string,
  newName: string,
): Promise<Readonly<RefactorPlan>> {
  const sourceFingerprint = fingerprintOf(fixture.file);
  const target = registerSectionTarget(fixture, deps.targetStore, oldName);
  const planOutcome = await runRefactorPlanWorkflow(
    { target: { handle: target.targetId }, operation: { rename_symbol: { newName } } },
    deps,
  );
  if (planOutcome.kind !== "completed") throw new Error(`Rename plan failed: ${planOutcome.kind}`);
  expect(planOutcome.plan.evidenceSource).toBe("structural");
  expect(planOutcome.plan.fileFingerprints).toEqual([
    { file: fixture.file, fingerprint: sourceFingerprint },
  ]);

  const applyOutcome = await runRefactorApplyWorkflow({ planId: planOutcome.plan.id }, deps);
  if (applyOutcome.kind !== "completed")
    throw new Error(`Rename apply failed: ${applyOutcome.kind}`);
  expect(
    assembleRefactorApplyDetails(applyOutcome.result, applyOutcome.plan).details.confidence,
  ).toBe("structural");
  return applyOutcome.plan;
}

interface Fixture {
  readonly tempRoot: string;
  readonly cwd: string;
  readonly routedRoot: string;
  readonly file: string;
}

function createFixture(routeKind: "nested" | "external"): Fixture {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "latex-rename-workflow-"));
  const cwd = path.join(tempRoot, "session");
  mkdirSync(cwd, { recursive: true });
  const routedRoot =
    routeKind === "nested" ? path.join(cwd, "packages", "paper") : path.join(tempRoot, "external");
  mkdirSync(routedRoot, { recursive: true });
  const file = path.join(routedRoot, "paper.tex");
  writeFileSync(file, String.raw`\section*[Short]{  Intro,   overview  }`);
  return { tempRoot, cwd, routedRoot, file };
}

function createDeps(
  fixture: Fixture,
  structural: StructuralProvider,
  result: RefactorResult,
  plans = new Map<string, RefactorPlan>(),
): RefactorWorkflowDeps & { readonly targetStore: Map<string, TargetStoreEntry> } {
  const targetStore = new Map<string, TargetStoreEntry>();
  const semantic = { refactor: async () => result } as unknown as SemanticProvider;
  const lspRuntime = {
    kind: "ready",
    runtime: { getOpenDocumentVersion: () => null },
  } as unknown as WorkspaceLspRuntimeState;
  return {
    cwd: fixture.cwd,
    targetStore,
    capability: new TestCapabilityAdapter({ semantic, structural, lspRuntime }),
    lookupTargetId: (targetId) => getWorkflowTarget(targetStore, targetId),
    registerTarget: (input) => registerWorkflowTarget(targetStore, fixture.cwd, input),
    storePlan: (plan) => {
      plans.set(plan.id, plan);
      return plan.id;
    },
    getPlan: (id) => plans.get(id),
    removePlan: (id) => plans.delete(id),
  };
}

function registerSectionTarget(
  fixture: Fixture,
  store: Map<string, TargetStoreEntry>,
  name: string,
): TargetStoreEntry {
  const source = readFileSync(fixture.file, "utf8");
  const firstTitleToken = name.split(/\s+/u)[0] ?? name;
  const start = source.indexOf(firstTitleToken);
  if (start < 0) throw new Error(`Title ${name} is not in the fixture.`);
  const fingerprint = fingerprintOf(fixture.file);
  return registerWorkflowTarget(store, fixture.cwd, {
    file: fixture.file,
    position: { line: 0, character: start },
    declarationPosition: { line: 0, character: 0 },
    declarationOccurrence: 0,
    displayLine: 1,
    displayCharacter: start + 1,
    name,
    kind: "Module",
    identityKind: "latex-section",
    confidence: "semantic",
    provenance: ["semantic", "structural"],
    anchorKind: "name",
    container: null,
    fileFingerprint: fingerprint,
  }).entry;
}

function fingerprintOf(file: string): string {
  const result = computeFileFingerprint(file);
  if (result.kind !== "ok") throw new Error("Could not fingerprint the fixture.");
  return result.fingerprint;
}
