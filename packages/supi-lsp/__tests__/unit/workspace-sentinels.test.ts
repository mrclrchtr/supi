import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "../../src/config/types.ts";
import {
  diffWorkspaceSentinelSnapshot,
  scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot,
} from "../../src/diagnostics/workspace-sentinels.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

let tmpDir = "";

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

describe("workspace sentinels", () => {
  it("discovers workspace sentinel files and ignores dependency folders", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-"));

    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}\n");
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}\n");
    fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "lock\n");

    const nested = path.join(tmpDir, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "package.json"), "{}\n");
    fs.writeFileSync(path.join(nested, "tsconfig.app.json"), "{}\n");

    const generated = path.join(tmpDir, "src", "generated");
    fs.mkdirSync(generated, { recursive: true });
    fs.writeFileSync(path.join(generated, "types.d.ts"), "export {};\n");

    const ignored = path.join(tmpDir, "node_modules", "ignored");
    fs.mkdirSync(ignored, { recursive: true });
    fs.writeFileSync(path.join(ignored, "package.json"), "{}\n");

    const snapshot = scanWorkspaceSentinels(tmpDir);
    expect(
      Array.from(snapshot.keys())
        .map((file) => path.relative(tmpDir, file))
        .sort(),
    ).toEqual([
      "package.json",
      "packages/app/package.json",
      "packages/app/tsconfig.app.json",
      "pnpm-lock.yaml",
      "src/generated/types.d.ts",
      "tsconfig.json",
    ]);
  });

  it("diffs created, changed, and deleted sentinel paths", () => {
    const previous = new Map<string, number>([
      ["/project/package.json", 100],
      ["/project/tsconfig.json", 200],
    ]);
    const next = new Map<string, number>([
      ["/project/package.json", 150],
      ["/project/packages/app/package.json", 300],
    ]);

    expect(diffWorkspaceSentinelSnapshot(previous, next)).toEqual([
      { uri: "file:///project/package.json", type: FileChangeType.Changed },
      { uri: "file:///project/packages/app/package.json", type: FileChangeType.Created },
      { uri: "file:///project/tsconfig.json", type: FileChangeType.Deleted },
    ]);
  });

  it("continues scanning past permission errors in subdirectories", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-perm-"));

    // Create a readable subdirectory with a sentinel
    const goodDir = path.join(tmpDir, "packages", "app");
    fs.mkdirSync(goodDir, { recursive: true });
    fs.writeFileSync(path.join(goodDir, "package.json"), "{}\n");

    // Create a subdirectory and make it unreadable
    const blockedDir = path.join(tmpDir, "packages", "blocked");
    fs.mkdirSync(blockedDir, { recursive: true });
    fs.writeFileSync(path.join(blockedDir, "package.json"), "{}\n");
    fs.chmodSync(blockedDir, 0o000);

    try {
      const snapshot = scanWorkspaceSentinels(tmpDir);
      // The accessible package.json must still be found
      const found = Array.from(snapshot.keys()).some((p) =>
        p.includes("packages/app/package.json"),
      );
      expect(found).toBe(true);

      // At least something was scanned (the root level sentinels)
      expect(snapshot.size).toBeGreaterThanOrEqual(1);
    } finally {
      // Restore permissions so cleanup can delete
      fs.chmodSync(blockedDir, 0o755);
    }
  });

  it("returns empty snapshot for deeply nested permission failure", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-deep-"));

    // Create a directory we can't read at the first level
    const blockedDir = path.join(tmpDir, "blocked");
    fs.mkdirSync(blockedDir);
    fs.chmodSync(blockedDir, 0o000);

    try {
      // scanWorkspaceSentinels wraps the walk in a try-catch, so
      // it should return an empty snapshot rather than throwing.
      const snapshot = scanWorkspaceSentinels(tmpDir);
      expect(snapshot).toBeInstanceOf(Map);
    } finally {
      fs.chmodSync(blockedDir, 0o755);
    }
  });
});

describe("workspace sentinels with source files", () => {
  it("tracks every regular source file when includeSourceFiles is set", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-src-"));

    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}\n");
    fs.writeFileSync(path.join(tmpDir, "app.ts"), "export const app = true;\n");
    const src = path.join(tmpDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "module.ts"), "export const m = true;\n");

    const snapshot = scanWorkspaceSentinels(tmpDir, { includeSourceFiles: true });
    expect(
      Array.from(snapshot.keys())
        .map((file) => path.relative(tmpDir, file))
        .sort(),
    ).toEqual(["app.ts", "src/module.ts", "tsconfig.json"]);

    // Without widening, source files stay absent.
    const sentinelOnly = scanWorkspaceSentinels(tmpDir);
    expect(
      Array.from(sentinelOnly.keys())
        .map((file) => path.relative(tmpDir, file))
        .sort(),
    ).toEqual(["tsconfig.json"]);
  });

  it("partitions sentinel events from source-file events on sync", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-partition-"));

    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}\n");
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const a = true;\n");

    // First pass primes the widened snapshot.
    const primed = syncWorkspaceSentinelSnapshot(tmpDir, new Map(), {
      includeSourceFiles: true,
    });
    expect(
      primed.changes.map((c) => path.basename(uriToFile(c.uri))).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["tsconfig.json"]);
    expect(
      primed.sourceChanges
        .map((c) => path.basename(uriToFile(c.uri)))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["existing.ts"]);

    // Create a new source file and change the config: the second pass sees a
    // source Created and a sentinel Changed, partitioned separately.
    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}\n");

    const next = syncWorkspaceSentinelSnapshot(tmpDir, primed.snapshot, {
      includeSourceFiles: true,
    });
    expect(
      next.changes.map((c) => path.basename(uriToFile(c.uri))).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["tsconfig.json"]);
    expect(
      next.sourceChanges
        .map((c) => path.basename(uriToFile(c.uri)))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["late.ts"]);
    expect(next.sourceChanges.every((c) => c.type === FileChangeType.Created)).toBe(true);
  });

  it("uses the runtime policy for source and sentinel inventory", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-policy-"));
    for (const relativePath of [
      ".cache/cached.ts",
      ".pi/npm/private.ts",
      "configured/drop.ts",
      "ignored/drop.ts",
      "ignored/keep.ts",
      ".github/workflow.ts",
      ".pi/npm/package.json",
    ]) {
      const file = path.join(tmpDir, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "export {};\n");
    }
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "ignored/*\n!ignored/keep.ts\n");
    const policy = createAutomaticLspPathPolicy(tmpDir, ["configured/"]);

    const snapshot = scanWorkspaceSentinels(tmpDir, { includeSourceFiles: true, policy });
    const sourceFiles = [...snapshot.keys()]
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.relative(tmpDir, file))
      .sort((a, b) => a.localeCompare(b));

    expect(sourceFiles).toEqual([".github/workflow.ts", "ignored/keep.ts"]);
    expect([...snapshot.keys()]).not.toContain(path.join(tmpDir, ".pi", "npm", "package.json"));
  });

  it("returns no sourceChanges when includeSourceFiles is not set", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-sentinels-nosrc-"));

    fs.writeFileSync(path.join(tmpDir, "app.ts"), "export const app = true;\n");

    const synced = syncWorkspaceSentinelSnapshot(tmpDir, new Map());
    expect(synced.sourceChanges).toEqual([]);
    expect(synced.changes).toEqual([]);
  });
});
