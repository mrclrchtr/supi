import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executePatternAction } from "../src/actions/pattern-action.ts";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pat-sum-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Summary via executePatternAction (direct handler calls)
// ---------------------------------------------------------------------------

describe("pattern summary via executePatternAction", () => {
  it("returns summary output when summary=true", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;\nconst foo = 2;");
    writeFileSync(join(tmpDir, "b.ts"), "const foo = 3;");
    writeFileSync(join(tmpDir, "c.ts"), "const bar = 4;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "foo", summary: true },
      tmpDir,
    );
    expect(result.content).toContain("Pattern Summary");
    expect(result.content).toContain("2 files");
    expect(result.content).not.toContain("L1:");
  });

  it("returns line-level output when summary is not set", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");
    writeFileSync(join(tmpDir, "b.ts"), "const foo = 2;");

    const result = await executePatternAction({ action: "pattern", pattern: "foo" }, tmpDir);
    expect(result.content).toContain("Pattern:");
    expect(result.content).toContain("L1:");
    expect(result.content).not.toContain("Pattern Summary");
  });

  it("returns line-level output when summary=false explicitly", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");
    writeFileSync(join(tmpDir, "b.ts"), "const foo = 2;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "foo", summary: false },
      tmpDir,
    );
    expect(result.content).toContain("L1:");
    expect(result.content).not.toContain("Pattern Summary");
  });

  it("groups matches by directory in summary output", async () => {
    const srcDir = join(tmpDir, "src");
    const libDir = join(tmpDir, "lib");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });

    writeFileSync(join(srcDir, "a.ts"), "const foo = 1;");
    writeFileSync(join(srcDir, "b.ts"), "const foo = 2;");
    writeFileSync(join(libDir, "c.ts"), "const foo = 3;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "foo", summary: true },
      tmpDir,
    );
    expect(result.content).toContain("Pattern Summary");
    expect(result.content).toContain("3 files");
    expect(result.content).toContain("src/");
    expect(result.content).toContain("lib/");
    expect(result.content).not.toContain("L1:");
  });

  it("returns search details metadata", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "foo", summary: true },
      tmpDir,
    );

    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
      expect(result.details.data.candidateCount).toBe(1);
    }
  });

  it("respects path scoping in summary mode", async () => {
    const subDirSrc = join(tmpDir, "src");
    const subDirOther = join(tmpDir, "other");
    mkdirSync(subDirSrc, { recursive: true });
    mkdirSync(subDirOther, { recursive: true });

    writeFileSync(join(subDirSrc, "a.ts"), "const target = 1;");
    writeFileSync(join(subDirOther, "b.ts"), "const target = 2;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "target", path: "src/", summary: true },
      tmpDir,
    );

    expect(result.content).toContain("1 file");
    expect(result.content).toContain("src/");
  });

  it("returns no-matches message when pattern not found in summary mode", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "nonexistent", summary: true },
      tmpDir,
    );
    expect(result.content).toContain("No matches");
  });

  it("returns summary with regex=true", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const SettingsFoo = 1;\nconst SettingsBar = 2;");
    writeFileSync(join(tmpDir, "b.ts"), "const ConfigFoo = 3;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "Settings|Config", regex: true, summary: true },
      tmpDir,
    );

    expect(result.content).toContain("Pattern Summary");
    expect(result.content).toContain("2 files");
  });

  it("includes all matches in summary when regex=true", async () => {
    // Create enough matches to exceed the default cap
    for (let i = 0; i < 30; i++) {
      writeFileSync(join(tmpDir, `file${i}.ts`), `const match_${i} = ${i};`);
    }

    const result = await executePatternAction(
      { action: "pattern", pattern: "^const", regex: true, summary: true },
      tmpDir,
    );

    // All 30 files should be counted, not capped at maxResults * 3 = 24
    expect(result.content).toContain("30 matches");
  });

  it("handles single match in summary", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "foo", summary: true },
      tmpDir,
    );

    expect(result.content).toContain("1 match");
    expect(result.content).toContain("1 file");
  });

  it("handles empty directory scope in summary", async () => {
    const result = await executePatternAction(
      { action: "pattern", pattern: "anything", summary: true },
      tmpDir,
    );
    expect(result.content).toContain("No matches");
  });
});

// ---------------------------------------------------------------------------
// Summary via executeAction (full validation + routing path)
// ---------------------------------------------------------------------------

describe("pattern summary via executeAction", () => {
  it("routes summary=true through executeAction", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");
    writeFileSync(join(tmpDir, "b.ts"), "const foo = 2;");
    writeFileSync(join(tmpDir, "c.ts"), "const bar = 3;");

    const result = await executeAction(
      { action: "pattern", pattern: "foo", summary: true },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Pattern Summary");
    expect(result.content).toContain("2 files");
    expect(result.content).not.toContain("L1:");
  });

  it("returns line-level output when summary is not set via executeAction", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");

    const result = await executeAction({ action: "pattern", pattern: "foo" }, { cwd: tmpDir });
    expect(result.content).toContain("Pattern:");
    expect(result.content).toContain("L1:");
    expect(result.content).not.toContain("Pattern Summary");
  });

  it("returns line-level output when summary=false via executeAction", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;");

    const result = await executeAction(
      { action: "pattern", pattern: "foo", summary: false },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("L1:");
    expect(result.content).not.toContain("Pattern Summary");
  });
});

// ---------------------------------------------------------------------------
// Non-summary output still works correctly
// ---------------------------------------------------------------------------

describe("non-summary output unaffected", () => {
  it("returns normal line-level results without summary param", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const hello = 1;\nconst hello = 2;\nconst world = 3;");

    const result = await executePatternAction({ action: "pattern", pattern: "hello" }, tmpDir);

    expect(result.content).toContain("Pattern:");
    expect(result.content).toContain("L1:");
    expect(result.content).toContain("L2:");
    expect(result.content).toContain("2 matches");
  });

  it("respects maxResults in non-summary mode", async () => {
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(tmpDir, `file${i}.ts`), `const hello = ${i};`);
    }

    const result = await executePatternAction(
      { action: "pattern", pattern: "hello", maxResults: 3 },
      tmpDir,
    );

    expect(result.content).toContain("10 matches");
    expect(result.content).toMatch(/omitted/);
  });

  it("literal default still works when summary=false", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const x = sendMessage({ ok: true });");

    const result = await executePatternAction(
      { action: "pattern", pattern: "sendMessage({", summary: false },
      tmpDir,
    );

    expect(result.content).toContain("sendMessage({");
    expect(result.content).not.toContain("No matches");
  });

  it("regex still works when summary=false", async () => {
    writeFileSync(
      join(tmpDir, "index.ts"),
      "const registerSettings = 1;\nconst registerConfig = 2;",
    );

    const result = await executePatternAction(
      { action: "pattern", pattern: "register(Settings|Config)", regex: true, summary: false },
      tmpDir,
    );

    expect(result.content).toContain("registerSettings");
    expect(result.content).toContain("registerConfig");
  });

  it("invalid regex error is not affected by summary=false", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const x = 1;");

    const result = await executePatternAction(
      { action: "pattern", pattern: "(", regex: true, summary: false },
      tmpDir,
    );

    expect(result.content).toContain("Error");
    expect(result.content).toContain("regex");
  });

  it("no-matches message works whether summary is set or not", async () => {
    const resultSummary = await executePatternAction(
      { action: "pattern", pattern: "xyznonexistent", summary: true },
      tmpDir,
    );
    const resultNoSummary = await executePatternAction(
      { action: "pattern", pattern: "xyznonexistent" },
      tmpDir,
    );
    const resultFalse = await executePatternAction(
      { action: "pattern", pattern: "xyznonexistent", summary: false },
      tmpDir,
    );

    expect(resultSummary.content).toContain("No matches");
    expect(resultNoSummary.content).toContain("No matches");
    expect(resultFalse.content).toContain("No matches");
  });
});
