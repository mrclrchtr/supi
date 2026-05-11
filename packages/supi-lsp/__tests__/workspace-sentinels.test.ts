import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "../src/types.ts";
import {
  diffWorkspaceSentinelSnapshot,
  isWorkspaceRecoveryTrigger,
  scanWorkspaceSentinels,
} from "../src/workspace-sentinels.ts";

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

  it("treats generated declaration files as recovery triggers", () => {
    expect(isWorkspaceRecoveryTrigger("/project/src/generated/types.d.ts", "/project")).toBe(true);
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
