import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  escapeRegex,
  isLowSignalPath,
  normalizePath,
  resolveScope,
  uriToFile,
} from "../../../../src/analysis/search/ripgrep.ts";

// biome-ignore lint/security/noSecrets: function name in test describe
describe("isLowSignalPath", () => {
  it("detects node_modules", () => {
    expect(isLowSignalPath("node_modules/pkg/index.js")).toBe(true);
  });

  it("detects .git", () => {
    expect(isLowSignalPath(".git/objects/abc")).toBe(true);
  });

  it("detects dist", () => {
    expect(isLowSignalPath("packages/core/dist/index.js")).toBe(true);
  });

  it("detects build", () => {
    expect(isLowSignalPath("build/output.js")).toBe(true);
  });

  it("detects coverage", () => {
    expect(isLowSignalPath("coverage/lcov-report/index.html")).toBe(true);
  });

  it("passes normal source paths", () => {
    expect(isLowSignalPath("packages/core/src/index.ts")).toBe(false);
  });

  it("passes root-level files", () => {
    expect(isLowSignalPath("index.ts")).toBe(false);
  });
});

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("foo.bar")).toBe("foo\\.bar");
    expect(escapeRegex("a+b*c")).toBe("a\\+b\\*c");
    expect(escapeRegex("test(1)")).toBe("test\\(1\\)");
  });

  it("leaves alphanumeric strings unchanged", () => {
    expect(escapeRegex("fooBar123")).toBe("fooBar123");
  });
});

describe("normalizePath", () => {
  it("strips leading @", () => {
    const result = normalizePath("@packages/core", "/project");
    expect(result).not.toContain("@");
    expect(result).toContain("packages/core");
  });
});

describe("uriToFile", () => {
  it("decodes percent-encoded file URIs", () => {
    expect(uriToFile("file:///project/my%20file.ts")).toBe("/project/my file.ts");
  });

  it("passes through non-file URIs", () => {
    expect(uriToFile("https://example.com")).toBe("https://example.com");
  });
});

describe("resolveScope", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "resolve-scope-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns cwd when scope is omitted", () => {
    const result = resolveScope(undefined, tmpDir);
    expect(result).toEqual({ kind: "ok", path: tmpDir });
  });

  it("resolves a relative directory scope", () => {
    const subDir = path.join(tmpDir, "src");
    mkdirSync(subDir);
    const result = resolveScope("src", tmpDir);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.path).toBe(subDir);
    }
  });

  it("resolves a file scope", () => {
    const file = path.join(tmpDir, "index.ts");
    writeFileSync(file, "export const x = 1;", "utf-8");
    const result = resolveScope("index.ts", tmpDir);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.path).toBe(file);
    }
  });

  it("strips a leading @", () => {
    const subDir = path.join(tmpDir, "src");
    mkdirSync(subDir);
    const result = resolveScope("@src", tmpDir);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.path).toBe(subDir);
    }
  });

  it("returns an error for a missing scope", () => {
    const result = resolveScope("does-not-exist", tmpDir);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("does-not-exist");
    }
  });

  it("returns an error for a scope with whitespace (multiple paths)", () => {
    const result = resolveScope("src README.md", tmpDir);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("single");
      expect(result.reason).toContain("src");
      expect(result.reason).toContain("README");
    }
  });

  it("returns an error for a scope with comma-separated paths", () => {
    const result = resolveScope("src, README.md", tmpDir);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("single");
    }
  });

  it("returns an error for a scope with semicolon-separated paths", () => {
    const result = resolveScope("src; README.md", tmpDir);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("single");
    }
  });
});
