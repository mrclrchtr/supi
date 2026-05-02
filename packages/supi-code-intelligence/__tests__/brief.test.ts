import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildArchitectureModel } from "../architecture.ts";
import { generateFocusedBrief, generateOverview, generateProjectBrief } from "../brief.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-brief-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function setupWorkspace() {
  writeJson(tmpDir, "package.json", { name: "test-ws", description: "A workspace" });
  writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

  const core = path.join(tmpDir, "packages", "core");
  mkdirSync(core, { recursive: true });
  writeJson(core, "package.json", { name: "@t/core", description: "Core library" });
  writeFileSync(path.join(core, "index.ts"), "export const x = 1;");

  const app = path.join(tmpDir, "packages", "app");
  mkdirSync(app, { recursive: true });
  writeJson(app, "package.json", {
    name: "@t/app",
    description: "Main app",
    dependencies: { "@t/core": "workspace:*" },
    pi: { extensions: ["./main.ts"] },
  });
  writeFileSync(path.join(app, "main.ts"), "export default function() {}");
}

describe("generateOverview", () => {
  it("returns null for model with no modules", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    const overview = generateOverview(model as NonNullable<typeof model>);
    expect(overview).toBeNull();
  });

  it("generates compact overview for workspace", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();

    const overview = generateOverview(model as NonNullable<typeof model>);
    expect(overview).not.toBeNull();
    expect(overview).toContain("Code Intelligence Overview");
    expect(overview).toContain("core");
    expect(overview).toContain("app");
    expect(overview).toContain("code_intel brief");
  });

  it("shows leaf annotation for modules with no deps and no dependents", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const overview = generateOverview(model as NonNullable<typeof model>);
    // core is depended on (not leaf), app depends on core (shows arrow)
    // The overview uses dense edge format
    expect(overview).toContain("→");
    expect(overview).toContain("core");
  });

  it("shows dependency arrows", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const overview = generateOverview(model as NonNullable<typeof model>);
    expect(overview).toContain("→");
    expect(overview).toContain("core");
  });

  it("stays roughly within token budget", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const overview = generateOverview(model as NonNullable<typeof model>);
    // Rough token estimate: ~4 chars per token
    const estimatedTokens = (overview?.length ?? 0) / 4;
    expect(estimatedTokens).toBeLessThan(600);
  });
});

describe("generateProjectBrief", () => {
  it("shows single module for single-package project", async () => {
    writeJson(tmpDir, "package.json", { name: "empty" });
    const model = await buildArchitectureModel(tmpDir);
    const { content, details } = generateProjectBrief(model as NonNullable<typeof model>);
    // Single package model creates one module
    expect(content).toContain("empty");
    expect(details.confidence).toBe("structural");
  });

  it("includes modules with descriptions", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { content, details } = generateProjectBrief(model as NonNullable<typeof model>);

    expect(content).toContain("core");
    expect(content).toContain("Core library");
    expect(content).toContain("app");
    expect(content).toContain("Main app");
    expect(details.dependencySummary?.moduleCount).toBe(2);
  });

  it("includes dependency graph section", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { content } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(content).toContain("Dependency Graph");
    expect(content).toContain("→");
  });

  it("includes next-query hints", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { content, details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(content).toContain("Next");
    expect(details.nextQueries.length).toBeGreaterThan(0);
  });

  it("highlights entrypoints in public surfaces", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { content, details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(content).toContain("Entrypoints");
    expect(details.publicSurfaces.length).toBeGreaterThan(0);
  });
});

describe("generateFocusedBrief", () => {
  it("returns error for missing path", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { content, details } = generateFocusedBrief(
      model as NonNullable<typeof model>,
      "/nonexistent/path",
    );
    expect(content).toContain("Error");
    expect(content).toContain("not found");
    expect(details.confidence).toBe("unavailable");
  });

  it("generates module brief for exact package dir", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const pkgDir = path.join(tmpDir, "packages", "app");
    const { content, details } = generateFocusedBrief(model as NonNullable<typeof model>, pkgDir);
    expect(content).toContain("Module: app");
    expect(content).toContain("Main app");
    expect(content).toContain("Entrypoints");
    expect(details.confidence).toBe("structural");
    expect(details.publicSurfaces.length).toBeGreaterThan(0);
  });

  it("includes dependencies and dependents", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);

    // core has dependents (app)
    const coreDir = path.join(tmpDir, "packages", "core");
    const { content: coreContent } = generateFocusedBrief(
      model as NonNullable<typeof model>,
      coreDir,
    );
    expect(coreContent).toContain("Dependents");
    expect(coreContent).toContain("app");

    // app has dependencies (core)
    const appDir = path.join(tmpDir, "packages", "app");
    const { content: appContent } = generateFocusedBrief(
      model as NonNullable<typeof model>,
      appDir,
    );
    expect(appContent).toContain("Dependencies (internal)");
    expect(appContent).toContain("core");
  });

  it("generates file brief", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const filePath = path.join(tmpDir, "packages", "core", "index.ts");
    const { content, details } = generateFocusedBrief(model as NonNullable<typeof model>, filePath);
    expect(content).toContain("File:");
    expect(content).toContain("Module: core");
    expect(details.confidence).toBe("structural");
  });

  it("generates non-module directory brief", async () => {
    setupWorkspace();
    const subDir = path.join(tmpDir, "packages", "core", "src");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(path.join(subDir, "helper.ts"), "export const h = 1;");

    const model = await buildArchitectureModel(tmpDir);
    const { content } = generateFocusedBrief(model as NonNullable<typeof model>, subDir);
    expect(content).toContain("Inside module: core");
    expect(content).toContain("helper.ts");
  });

  it("lists source files in directory", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const coreDir = path.join(tmpDir, "packages", "core");
    const { content } = generateFocusedBrief(model as NonNullable<typeof model>, coreDir);
    expect(content).toContain("Source Files");
    expect(content).toContain("index.ts");
  });
});
