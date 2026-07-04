import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveToolPromptSurface } from "../../src/tool-framework.ts";

const DEFAULTS = {
  description: "Default description",
  promptSnippet: "default snippet",
  promptGuidelines: ["default one", "default two"],
};

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-prompt-surface-test-"));
}

function writeGlobalConfig(homeDir: string, value: unknown): void {
  const dir = path.join(homeDir, ".pi/agent/supi");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(value));
}

function writeProjectConfig(cwd: string, value: unknown): void {
  const dir = path.join(cwd, ".pi/supi");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(value));
}

function addPiTrustMarker(cwd: string): void {
  const dir = path.join(cwd, ".pi");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "settings.json"), "{}\n");
}

function ctx(cwd: string, trusted = true) {
  return { cwd, isProjectTrusted: () => trusted };
}

describe("resolveToolPromptSurface", () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = makeTempDir();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface).toEqual(DEFAULTS);
    expect(result.diagnostics).toEqual([]);
  });

  it("applies global overrides", () => {
    writeGlobalConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: {
            promptSurface: {
              description: "Global description",
              appendPromptGuidelines: ["global append"],
            },
          },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface).toEqual({
      description: "Global description",
      promptSnippet: "default snippet",
      promptGuidelines: ["default one", "default two", "global append"],
    });
  });

  it("applies trusted project overrides after global overrides", () => {
    addPiTrustMarker(tmpDir);
    writeGlobalConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: { promptSurface: { description: "Global description" } },
        },
      },
    });
    writeProjectConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: { promptSurface: { promptSnippet: "project snippet" } },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface.description).toBe("Global description");
    expect(result.surface.promptSnippet).toBe("project snippet");
  });

  it("ignores project prompt-surface overrides without a PI trust marker", () => {
    writeProjectConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: { promptSurface: { description: "Project description" } },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir, true),
      homeDir: tmpDir,
    });

    expect(result.surface.description).toBe("Default description");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "projectPromptSurfaceIgnored", scope: "project" }),
    ]);
  });

  it("ignores project prompt-surface overrides when the project is untrusted", () => {
    addPiTrustMarker(tmpDir);
    writeProjectConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: { promptSurface: { description: "Project description" } },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir, false),
      homeDir: tmpDir,
    });

    expect(result.surface.description).toBe("Default description");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "projectPromptSurfaceIgnored", scope: "project" }),
    ]);
  });

  it("resets listed fields to package defaults before explicit values", () => {
    addPiTrustMarker(tmpDir);
    writeGlobalConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: {
            promptSurface: {
              description: "Global description",
              promptGuidelines: ["global guideline"],
            },
          },
        },
      },
    });
    writeProjectConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: {
            promptSurface: {
              $reset: ["description", "promptGuidelines"],
              description: "Project description",
              appendPromptGuidelines: ["project append"],
            },
          },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface).toEqual({
      description: "Project description",
      promptSnippet: "default snippet",
      promptGuidelines: ["default one", "default two", "project append"],
    });
  });

  it("applies prepend and append around the effective guideline list", () => {
    writeGlobalConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: {
            promptSurface: {
              promptGuidelines: ["global replacement"],
              prependPromptGuidelines: ["global prepend"],
              appendPromptGuidelines: ["global append"],
            },
          },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface.promptGuidelines).toEqual([
      "global prepend",
      "global replacement",
      "global append",
    ]);
  });

  it("ignores invalid fields and keeps valid fields", () => {
    writeGlobalConfig(tmpDir, {
      "ask-user": {
        tools: {
          ask_user: {
            promptSurface: {
              description: "",
              promptSnippet: "valid snippet",
              promptGuidelines: "not an array",
              appendPromptGuidelines: ["valid append"],
              $reset: ["unknown"],
            },
          },
        },
      },
    });

    const result = resolveToolPromptSurface({
      section: "ask-user",
      toolName: "ask_user",
      defaults: DEFAULTS,
      ctx: ctx(tmpDir),
      homeDir: tmpDir,
    });

    expect(result.surface).toEqual({
      description: "Default description",
      promptSnippet: "valid snippet",
      promptGuidelines: ["default one", "default two", "valid append"],
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
