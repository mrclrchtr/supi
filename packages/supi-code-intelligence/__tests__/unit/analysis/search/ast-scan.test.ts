import {
  promises as fs,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enumerateAstFiles } from "../../../../src/analysis/search/ast-scan.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "ast-scan-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relativePath: string, content = "export const target = true;\n"): string {
  const file = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

describe("enumerateAstFiles", () => {
  it("enumerates supported visible files within the declared default universe", async () => {
    const source = write("src/source.ts");
    const gitIgnoredSource = write("src/generated.ts");
    writeFileSync(path.join(tmpDir, ".gitignore"), "src/generated.ts\n");
    write("src/readme.md", "target\n");
    write("src/python.py", "target()\n");
    write(".hidden.ts");
    write("node_modules/pkg/index.js");
    write("dist/generated.ts");

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [tmpDir],
      operation: "outline",
      deadline: Number.POSITIVE_INFINITY,
      maxFiles: 5_000,
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.files).toEqual(
      [realpathSync(gitIgnoredSource), realpathSync(source)].sort((a, b) => a.localeCompare(b)),
    );
    expect(result.eligibleFileCount).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "hidden-entry" }),
        expect.objectContaining({ reason: "excluded-directory" }),
        expect.objectContaining({ reason: "unsupported-extension" }),
        expect.objectContaining({ reason: "unsupported-operation" }),
      ]),
    );
  });

  it("honors explicit roots and deduplicates overlapping scopes", async () => {
    const hidden = write(".hidden.ts");
    const dependency = write("node_modules/pkg/index.js");
    const source = write("src/source.ts");
    const directoryReads = new Map<string, number>();

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [path.join(tmpDir, "src"), tmpDir, hidden, path.join(tmpDir, "node_modules")],
      operation: "outline",
      deadline: Number.POSITIVE_INFINITY,
      maxFiles: 5_000,
      operations: {
        realpath: fs.realpath,
        stat: fs.stat,
        readDirectory: async (directory) => {
          directoryReads.set(directory, (directoryReads.get(directory) ?? 0) + 1);
          return fs.readdir(directory, { withFileTypes: true });
        },
      },
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.files).toEqual(
      [dependency, hidden, source]
        .map((file) => realpathSync(file))
        .sort((a, b) => a.localeCompare(b)),
    );
    expect(result.eligibleFileCount).toBe(3);
    expect(directoryReads.get(realpathSync(path.join(tmpDir, "src")))).toBe(1);
  });

  it("rejects an explicit file without a supported grammar", async () => {
    const markdown = write("README.md", "target\n");

    await expect(
      enumerateAstFiles({
        cwd: tmpDir,
        roots: [markdown],
        operation: "outline",
        deadline: Number.POSITIVE_INFINITY,
        maxFiles: 5_000,
      }),
    ).resolves.toEqual({
      kind: "invalid-root",
      path: "README.md",
      reason: "Explicit AST file scope has no supported Tree-sitter grammar.",
    });
  });

  it("rejects an exact file whose grammar does not support the requested operation", async () => {
    const python = write("src/source.py", "target()\n");

    await expect(
      enumerateAstFiles({
        cwd: tmpDir,
        roots: [python],
        operation: "outline",
        deadline: Number.POSITIVE_INFINITY,
        maxFiles: 5_000,
      }),
    ).resolves.toEqual({
      kind: "invalid-root",
      path: "src/source.py",
      reason: "Explicit AST file scope does not support the outline operation.",
    });
  });

  it("uses operation-specific eligibility instead of general parser support", async () => {
    const python = write("src/source.py", "target()\n");

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [tmpDir],
      operation: "call-sites",
      deadline: Number.POSITIVE_INFINITY,
      maxFiles: 5_000,
    });

    expect(result).toMatchObject({
      kind: "completed",
      files: [realpathSync(python)],
      eligibleFileCount: 1,
      complete: true,
      policy: { operation: "call-sites", supportedExtensions: expect.arrayContaining([".py"]) },
    });
  });

  it("reports unreadable traversal without discarding files already enumerated", async () => {
    const source = write("src/source.ts");
    const blocked = path.join(tmpDir, "blocked");
    mkdirSync(blocked);

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [tmpDir],
      operation: "outline",
      deadline: Number.POSITIVE_INFINITY,
      maxFiles: 5_000,
      operations: {
        realpath: fs.realpath,
        stat: fs.stat,
        readDirectory: async (directory) => {
          if (directory === realpathSync(blocked)) throw new Error("EACCES");
          return fs.readdir(directory, { withFileTypes: true });
        },
      },
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.files).toEqual([realpathSync(source)]);
    expect(result.eligibleFileCount).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.limitations).toContainEqual({
      reason: "unreadable-path",
      pathCount: 1,
      examples: ["blocked"],
    });
  });

  it("marks a deterministic eligible-file safety cap as incomplete", async () => {
    write("src/a.ts");
    write("src/b.ts");
    write("src/c.ts");

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [tmpDir],
      operation: "outline",
      deadline: Number.POSITIVE_INFINITY,
      maxFiles: 1,
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.files).toHaveLength(1);
    expect(result.eligibleFileCount).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.limitations).toContainEqual(
      expect.objectContaining({ reason: "safety-limit", pathCount: null }),
    );
  });

  it("propagates pre-abort and mid-enumeration cancellation", async () => {
    write("src/a.ts");
    const preAbort = new AbortController();
    const preAbortReason = new Error("pre-abort");
    preAbort.abort(preAbortReason);

    await expect(
      enumerateAstFiles({
        cwd: tmpDir,
        roots: [tmpDir],
        operation: "outline",
        deadline: Number.POSITIVE_INFINITY,
        maxFiles: 5_000,
        signal: preAbort.signal,
      }),
    ).rejects.toBe(preAbortReason);

    const midAbort = new AbortController();
    const midAbortReason = new Error("mid-abort");
    await expect(
      enumerateAstFiles({
        cwd: tmpDir,
        roots: [tmpDir],
        operation: "outline",
        deadline: Number.POSITIVE_INFINITY,
        maxFiles: 5_000,
        signal: midAbort.signal,
        operations: {
          realpath: fs.realpath,
          stat: fs.stat,
          readDirectory: async (directory) => {
            const entries = await fs.readdir(directory, { withFileTypes: true });
            midAbort.abort(midAbortReason);
            return entries;
          },
        },
      }),
    ).rejects.toBe(midAbortReason);
  });

  it("reports deadline expiry without relying on wall-clock timing", async () => {
    write("src/a.ts");
    let tick = 0;

    const result = await enumerateAstFiles({
      cwd: tmpDir,
      roots: [tmpDir],
      operation: "outline",
      deadline: 2,
      maxFiles: 5_000,
      now: () => tick++,
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.complete).toBe(false);
    expect(result.eligibleFileCount).toBeNull();
    expect(result.limitations).toContainEqual({
      reason: "timeout",
      pathCount: null,
      examples: [expect.any(String)],
    });
  });
});
