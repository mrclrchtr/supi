import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeIndexAction } from "../src/actions/index-action.ts";
import { executePatternAction } from "../src/actions/pattern-action.ts";
import { buildArchitectureModel } from "../src/architecture.ts";
import { generateFocusedBrief, generateProjectBrief } from "../src/brief.ts";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-details-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function setupWorkspace() {
  writeJson(tmpDir, "package.json", { name: "ws", description: "Workspace" });
  writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

  const core = path.join(tmpDir, "packages", "core");
  mkdirSync(core, { recursive: true });
  writeJson(core, "package.json", { name: "@t/core", description: "Core" });
  writeFileSync(path.join(core, "index.ts"), "export const x = 1;");

  const app = path.join(tmpDir, "packages", "app");
  mkdirSync(app, { recursive: true });
  writeJson(app, "package.json", {
    name: "@t/app",
    dependencies: { "@t/core": "workspace:*" },
    pi: { extensions: ["./main.ts"] },
  });
  writeFileSync(path.join(app, "main.ts"), "export default function() {}");

  const cli = path.join(tmpDir, "packages", "cli");
  mkdirSync(cli, { recursive: true });
  writeJson(cli, "package.json", {
    name: "@t/cli",
    dependencies: { "@t/core": "workspace:*" },
  });
}

describe("project brief details metadata", () => {
  it("includes confidence mode", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.confidence).toBe("structural");
  });

  it("includes dependency summary", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.dependencySummary).not.toBeNull();
    expect(details.dependencySummary?.moduleCount).toBe(3);
    expect(details.dependencySummary?.edgeCount).toBeGreaterThanOrEqual(2);
  });

  it("includes start-here for highly depended modules", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    // core is depended on by app and cli => should appear in start-here
    expect(details.startHere.length).toBeGreaterThanOrEqual(1);
    const coreEntry = details.startHere.find((s) => s.target.includes("core"));
    expect(coreEntry).toBeDefined();
    expect(coreEntry?.reason).toContain("dependency");
  });

  it("includes public surfaces from entrypoints", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.publicSurfaces.length).toBeGreaterThan(0);
    const appSurface = details.publicSurfaces.find((s) => s.includes("app"));
    expect(appSurface).toBeDefined();
  });

  it("includes next queries", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.nextQueries.length).toBeGreaterThan(0);
  });
});

describe("focused brief details metadata", () => {
  it("includes confidence for module brief", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateFocusedBrief(
      model as NonNullable<typeof model>,
      path.join(tmpDir, "packages", "core"),
    );
    expect(details.confidence).toBe("structural");
    expect(details.focusTarget).not.toBeNull();
  });

  it("includes dependency summary for module brief", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const appDir = path.join(tmpDir, "packages", "app");
    const { details } = generateFocusedBrief(model as NonNullable<typeof model>, appDir);
    expect(details.dependencySummary).not.toBeNull();
    expect(details.dependencySummary?.moduleCount).toBe(1);
  });

  it("reports unavailable confidence for missing path", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateFocusedBrief(model as NonNullable<typeof model>, "/does/not/exist");
    expect(details.confidence).toBe("unavailable");
  });

  it("includes start-here for module with entrypoints", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const appDir = path.join(tmpDir, "packages", "app");
    const { details } = generateFocusedBrief(model as NonNullable<typeof model>, appDir);
    expect(details.startHere.length).toBeGreaterThan(0);
    expect(details.startHere[0].reason).toContain("entrypoint");
  });

  it("includes next queries for module with dependents", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const coreDir = path.join(tmpDir, "packages", "core");
    const { details } = generateFocusedBrief(model as NonNullable<typeof model>, coreDir);
    expect(details.nextQueries.length).toBeGreaterThan(0);
    const affectedHint = details.nextQueries.find((q) => q.includes("affected"));
    expect(affectedHint).toBeDefined();
  });
});

describe("structured details via executeAction", () => {
  it("returns brief details for project brief action", async () => {
    setupWorkspace();
    const result = await executeAction({ action: "brief" }, { cwd: tmpDir });
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("brief");
    if (result.details?.type === "brief") {
      expect(result.details.data.confidence).toBe("structural");
    }
  });

  it("returns index search details", async () => {
    const result = executeIndexAction(tmpDir);
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("structural");
      expect(result.details.data.candidateCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns pattern search details", async () => {
    writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;");
    const result = await executePatternAction({ action: "pattern", pattern: "foo" }, tmpDir);
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
  });

  it("returns undefined details for validation errors", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    const result = await executeAction({ action: "unknown" as any }, { cwd: tmpDir });
    expect(result.details).toBeUndefined();
    expect(result.content).toContain("Error");
  });
});
