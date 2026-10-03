import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeGraphSpec } from "../../../../src/tool/code_graph/spec.ts";
import { codeInspectSpec } from "../../../../src/tool/code_inspect/spec.ts";
import { codeRefactorApplySpec } from "../../../../src/tool/code_refactor_apply/spec.ts";
import { codeRefactorPlanSpec } from "../../../../src/tool/code_refactor_plan/spec.ts";
import { codeResolveSpec } from "../../../../src/tool/code_resolve/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { hasCommand } from "../../../helpers/integration-utils.ts";
import { TestCapabilityAdapter } from "../../../helpers/test-capability-adapter.ts";

const HAS_TEXLAB = hasCommand("texlab");
const LATEX_FIXTURE = fileURLToPath(
  new URL("../../../fixtures/latex-label-references/", import.meta.url),
);

type Tool = ReturnType<typeof getTool>;
type CodeResult = {
  details: {
    data: unknown;
    displaySections?: Array<{ lines: readonly string[] }>;
  };
};

let cwd: string;
let homeDir: string;
let mainFile: string;
let headingFile: string;
let bodyFile: string;
let appendixFile: string;
let underscoreFile: string;
let controller: LspRuntimeController | undefined;
let treeSitter: ReturnType<typeof createTreeSitterSession> | undefined;
let resolveTool: Tool;
let inspectTool: Tool;
let graphTool: Tool;
let planTool: Tool;
let applyTool: Tool;
let context: ReturnType<typeof makeCtx>;
let labelTargetId: string;
let headingTargetId: string;
let underscoreLabelTargetId: string;

async function prepareWorkspace(): Promise<void> {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "latex-public-target-"));
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "latex-public-home-"));
  fs.cpSync(LATEX_FIXTURE, cwd, { recursive: true });
  mainFile = path.join(cwd, "main.tex");
  headingFile = path.join(cwd, "heading.tex");
  fs.writeFileSync(
    headingFile,
    String.raw`\documentclass{article}
\begin{document}
\section{Intro}
\label{sec:Intro}
\end{document}
`,
  );
  bodyFile = path.join(cwd, "chapters", "body.tex");
  appendixFile = path.join(cwd, "chapters", "appendix.tex");
  const source = fs.readFileSync(mainFile, "utf8");
  if (!source.includes("\\label{sec:intro}")) {
    throw new Error("The preserved LaTeX fixture has no sec:intro label.");
  }
  const originalHeading = ["Intro", "duction"].join("");
  const targetSource = source
    .replace(originalHeading, "Intro")
    .replaceAll("sec:intro", "sec:Intro");
  fs.writeFileSync(mainFile, targetSource.replace("\\label{sec:Intro}", "\\label{sec:Intro} "));
  underscoreFile = path.join(cwd, "underscore.tex");
  fs.writeFileSync(
    underscoreFile,
    String.raw`\documentclass{article}
\begin{document}
\section{Heading}
\label{sec:my_label}
\end{document}
`,
  );
  for (const file of [bodyFile, appendixFile]) {
    const text = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, text.replaceAll("sec:intro", "sec:Intro"));
  }
}

async function startTexlab() {
  controller = new LspRuntimeController(cwd, undefined, { homeDir });
  const started = await controller.start();
  if (started.kind !== "ready") throw new Error(`Texlab did not start: ${started.kind}`);
  const runtime = started.runtime;
  for (const file of [mainFile, headingFile, bodyFile, appendixFile, underscoreFile]) {
    if (!(await runtime.trackFile(file)))
      throw new Error(`Could not track ${path.basename(file)}.`);
    const ready = await runtime.waitUntilReadyForFile(file);
    if (ready.kind !== "ready") throw new Error(`Texlab is not ready for ${path.basename(file)}.`);
  }
  return runtime;
}

function latexCommand(command: string): string {
  return `${String.fromCharCode(92)}${command}`;
}

function registerTools(runtime: Awaited<ReturnType<typeof startTexlab>>) {
  treeSitter = createTreeSitterSession(cwd);
  const capability = new TestCapabilityAdapter({
    semantic: createLspSemanticProvider(runtime),
    structural: createTreeSitterProvider(treeSitter),
    lspRuntime: { kind: "ready", runtime },
  });
  const session = new WorkspaceCodeIntelligenceSession(cwd, capability);
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => session, undefined, [
    codeResolveSpec,
    codeGraphSpec,
    codeRefactorPlanSpec,
    codeRefactorApplySpec,
    codeInspectSpec,
  ]);
  resolveTool = getTool(pi, "code_resolve");
  inspectTool = getTool(pi, "code_inspect");
  graphTool = getTool(pi, "code_graph");
  planTool = getTool(pi, "code_refactor_plan");
  applyTool = getTool(pi, "code_refactor_apply");
  context = makeCtx({ cwd });
  return session;
}

describe.skipIf(!HAS_TEXLAB)("LaTeX targets through real Texlab and Tree-sitter", () => {
  beforeAll(async () => {
    await prepareWorkspace();
    const runtime = await startTexlab();
    const session = registerTools(runtime);
    const group = await session.resolve({ target: { file: mainFile } });
    if (group.kind !== "target-group")
      throw new Error("The TeX file did not return a Target group.");
    const label = group.targets.find((target) => target.name === "sec:Intro");
    if (!label) throw new Error("Texlab and Tree-sitter did not report sec:Intro.");
    labelTargetId = label.targetId;
    const headingGroup = await session.resolve({ target: { file: headingFile } });
    if (headingGroup.kind !== "target-group") {
      throw new Error("The heading TeX file did not return a Target group.");
    }
    const heading = headingGroup.targets.find((target) => target.name === "Intro");
    if (!heading) throw new Error("Texlab and Tree-sitter did not report the Intro section.");
    headingTargetId = heading.targetId;
    const underscoreGroup = await session.resolve({ target: { file: underscoreFile } });
    if (underscoreGroup.kind !== "target-group") {
      throw new Error("The underscore TeX file did not return a Target group.");
    }
    const underscoreLabel = underscoreGroup.targets.find(
      (target) => target.name === "sec:my_label",
    );
    if (!underscoreLabel) {
      throw new Error("Texlab and Tree-sitter did not report sec:my_label.");
    }
    underscoreLabelTargetId = underscoreLabel.targetId;
  }, 30_000);

  afterAll(async () => {
    await treeSitter?.dispose();
    await controller?.shutdown();
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    if (homeDir) fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("resolves the label key prefix and heading-name suffix to its discovered identity", async () => {
    const fileResult = (await resolveTool.execute(
      "latex-file-target",
      { target: { file: mainFile } },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const fileDetails = fileResult.details as {
      data: { targets: Array<Record<string, unknown>> };
    };
    const labelTarget = fileDetails.data.targets.find((target) => target.name === "sec:Intro");
    expect(labelTarget).toMatchObject({
      displayLine: 6,
      displayCharacter: 8,
      anchorKind: "name",
      provenance: ["structural"],
    });

    for (const character of [8, 10, 12]) {
      const anchorResult = (await resolveTool.execute(
        `latex-label-anchor-${character}`,
        { target: { anchor: { file: mainFile, line: 6, character } } },
        undefined,
        undefined,
        context,
      )) as CodeResult;
      const anchorDetails = anchorResult.details as {
        data: {
          targets: Array<{
            targetId: string;
            name: string | null;
            kind: string | null;
            anchorKind: string;
            displayCharacter: number;
            resolution?: { source: string };
          }>;
        };
      };
      expect(anchorDetails.data.targets[0]).toMatchObject({
        name: "sec:Intro",
        kind: "label",
        anchorKind: "name",
        displayCharacter: 8,
        resolution: { source: "structural-identifier" },
      });
      expect(anchorDetails.data.targets[0]?.targetId).toBe(labelTarget?.targetId);
    }

    for (const character of [2, 7, 18]) {
      const rejected = (await resolveTool.execute(
        `latex-non-name-${character}`,
        { target: { anchor: { file: mainFile, line: 6, character } } },
        undefined,
        undefined,
        context,
      )) as CodeResult;
      expect(JSON.stringify(rejected.details)).toContain("No symbol target resolved");
    }
  });

  it("anchors a section rename to its title instead of its label", async () => {
    const fileResult = (await resolveTool.execute(
      "latex-heading-file-target",
      { target: { file: headingFile } },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const fileDetails = fileResult.details as {
      data: { targets: Array<Record<string, unknown>> };
    };
    const heading = fileDetails.data.targets.find((target) => target.name === "Intro");
    const planResult = (await planTool.execute(
      "latex-heading-rename",
      {
        target: { handle: headingTargetId },
        operation: { rename_symbol: { newName: "NewHeading" } },
      },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const planDetails = planResult.details as {
      data: { confidence: string; nextQueries: string[] };
      displaySections?: Array<{ lines: readonly string[] }>;
    };
    const edits = planDetails.displaySections?.flatMap((section) => section.lines) ?? [];

    expect(edits).toEqual([`${headingFile} L3:10 → L3:15: NewHeading`]);
    expect(planDetails.data.confidence).toBe("structural");
    expect(heading).toMatchObject({
      name: "Intro",
      displayLine: 3,
      displayCharacter: 10,
      anchorKind: "name",
    });

    const anchorResult = (await resolveTool.execute(
      "latex-heading-name-anchor",
      { target: { anchor: { file: headingFile, line: 3, character: 10 } } },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const anchorDetails = anchorResult.details as {
      data: { targets: Array<{ targetId: string; name: string | null }> };
    };
    expect(anchorDetails.data.targets[0]).toMatchObject({ name: "Intro" });
    expect(anchorDetails.data.targets[0]?.targetId).toBe(heading?.targetId);

    const nextQuery = planDetails.data.nextQueries.find((query) => query.includes("planId:")) ?? "";
    const planId = /planId: "([^"]+)"/u.exec(nextQuery)?.[1];
    expect(planId).toMatch(/^plan-[0-9a-f]{12}$/u);
    await applyTool.execute("latex-heading-apply", { planId }, undefined, undefined, context);
    const appliedSource = fs.readFileSync(headingFile, "utf8");
    const newHeading = ["New", "Heading"].join("");
    expect(appliedSource).toContain(latexCommand(`section{${newHeading}}`));
    expect(appliedSource).toContain(latexCommand("label{sec:Intro}"));
    expect(appliedSource).not.toContain(latexCommand(`label{sec:${newHeading}}`));
  });

  it("shows an underscore label as one syntax token in point inspection", async () => {
    const result = (await inspectTool.execute(
      "latex-underscore-inspect",
      { point: { file: underscoreFile, line: 4, character: 14 } },
      undefined,
      undefined,
      context,
    )) as { content: Array<{ text: string }> };
    const text = result.content[0]?.text ?? "";

    expect(text).toContain("Type: `label` at underscore.tex:4:8–4:20");
    expect(text).toContain("sec:my_label");
    expect(text).toContain("`curly_group_label");
    expect(text).toContain("`label_definition");
    expect(text).not.toContain("`subscript");
  }, 10_000);

  it("keeps the full underscore label name and target identity", async () => {
    const fileResult = (await resolveTool.execute(
      "latex-underscore-file-target",
      { target: { file: underscoreFile } },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const fileDetails = fileResult.details as {
      data: { targets: Array<Record<string, unknown>> };
    };
    const label = fileDetails.data.targets.find((target) => target.name === "sec:my_label");
    expect(label).toMatchObject({
      targetId: underscoreLabelTargetId,
      name: "sec:my_label",
      displayLine: 4,
      displayCharacter: 8,
      anchorKind: "name",
    });

    for (const character of [8, 14, 19]) {
      const anchorResult = (await resolveTool.execute(
        `latex-underscore-label-anchor-${character}`,
        { target: { anchor: { file: underscoreFile, line: 4, character } } },
        undefined,
        undefined,
        context,
      )) as CodeResult;
      const anchorDetails = anchorResult.details as {
        data: { targets: Array<{ targetId: string; name: string | null }> };
      };
      expect(anchorDetails.data.targets[0]).toMatchObject({
        targetId: underscoreLabelTargetId,
        name: "sec:my_label",
      });
    }
  });

  it("returns only the cross-file label references, not label commands", async () => {
    const graph = (await graphTool.execute(
      "latex-label-references",
      { target: { handle: labelTargetId }, relations: ["references"] },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const details = graph.details as {
      data: {
        sections: Array<{ rel: string; fileGroups?: Array<{ file: string; count: number }> }>;
      };
    };
    const references = details.data.sections.find((section) => section.rel === "references");
    expect(references?.fileGroups).toHaveLength(2);
    expect(references?.fileGroups).toEqual(
      expect.arrayContaining([
        { file: "main.tex", count: 1 },
        { file: "chapters/body.tex", count: 1 },
      ]),
    );
  });

  it("plans a label rename at the key and includes its cross-file uses", async () => {
    const result = (await planTool.execute(
      "latex-label-rename",
      {
        target: { handle: labelTargetId },
        operation: { rename_symbol: { newName: "sec:overview" } },
      },
      undefined,
      undefined,
      context,
    )) as CodeResult;
    const details = result.details as {
      displaySections?: Array<{ lines: readonly string[] }>;
    };
    const edits = details.displaySections?.flatMap((section) => section.lines) ?? [];
    expect(edits).toHaveLength(3);
    expect(
      new Set(edits.map((line) => [mainFile, bodyFile].find((file) => line.startsWith(file)))),
    ).toEqual(new Set([mainFile, bodyFile]));
    expect(edits.every((line) => line.endsWith("sec:overview"))).toBe(true);
  });
});
