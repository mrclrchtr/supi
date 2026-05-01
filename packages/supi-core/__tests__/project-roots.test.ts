import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKnownRootsMap,
  byPathDepth,
  dedupeTopmostRoots,
  findProjectRoot,
  isWithin,
  isWithinOrEqual,
  mergeKnownRoots,
  resolveKnownRoot,
  segmentCount,
  sortRootsBySpecificity,
  walkProject,
} from "../project-roots.ts";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-core-roots-"));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "{}\n");
}

describe("walkProject", () => {
  it("visits directories up to max depth", () => {
    const root = makeTmpDir();
    writeFile(root, "a/b/c/file.txt");

    const visited: string[] = [];
    walkProject(root, 2, (dir) => {
      visited.push(path.relative(root, dir));
    });

    expect(visited).toContain("");
    expect(visited).toContain("a");
    expect(visited).toContain(path.join("a", "b"));
    expect(visited).not.toContain(path.join("a", "b", "c"));
  });

  it("skips ignored directories", () => {
    const root = makeTmpDir();
    writeFile(root, "node_modules/pkg/file.txt");
    writeFile(root, ".git/hooks/file.txt");
    writeFile(root, "src/file.txt");

    const visited: string[] = [];
    walkProject(root, 3, (dir) => {
      visited.push(path.relative(root, dir));
    });

    expect(visited).toContain("");
    expect(visited).toContain("src");
    expect(visited).not.toContain("node_modules");
    expect(visited).not.toContain(".git");
  });

  it("passes entry names to callback", () => {
    const root = makeTmpDir();
    writeFile(root, "marker.json");

    let names: Set<string> = new Set();
    walkProject(root, 0, (_dir, entryNames) => {
      names = entryNames;
    });

    expect(names.has("marker.json")).toBe(true);
  });
});

describe("findProjectRoot", () => {
  it("finds root by marker upward", () => {
    const root = makeTmpDir();
    writeFile(root, "package.json");
    const nested = path.join(root, "src", "deep");

    const result = findProjectRoot(nested, ["package.json"], "/fallback");
    expect(result).toBe(root);
  });

  it("returns fallback when no marker found", () => {
    const result = findProjectRoot("/tmp", ["nonexistent-marker-xyz"], "/fallback");
    expect(result).toBe("/fallback");
  });
});

describe("dedupeTopmostRoots", () => {
  it("keeps shortest parent roots first", () => {
    expect(
      dedupeTopmostRoots(["/tmp/project/packages/a", "/tmp/project", "/tmp/project/packages/b"]),
    ).toEqual(["/tmp/project"]);
  });

  it("keeps independent roots", () => {
    expect(dedupeTopmostRoots(["/a", "/b", "/c"])).toEqual(["/a", "/b", "/c"]);
  });

  it("deduplicates exact duplicates", () => {
    expect(dedupeTopmostRoots(["/a", "/a", "/a/b"])).toEqual(["/a"]);
  });
});

describe("sortRootsBySpecificity", () => {
  it("sorts by depth descending then alphabetically", () => {
    expect(sortRootsBySpecificity(["/a", "/a/b", "/a/b/c", "/z"])).toEqual([
      "/a/b/c",
      "/a/b",
      "/a",
      "/z",
    ]);
  });
});

describe("buildKnownRootsMap", () => {
  it("groups roots by server name", () => {
    const map = buildKnownRootsMap([
      { name: "ts", root: "/a" },
      { name: "ts", root: "/a/b" },
      { name: "rust", root: "/c" },
    ]);

    expect(map.get("ts")).toEqual(["/a/b", "/a"]);
    expect(map.get("rust")).toEqual(["/c"]);
  });
});

describe("mergeKnownRoots", () => {
  it("adds new root and re-sorts", () => {
    expect(mergeKnownRoots(["/a"], "/a/b")).toEqual(["/a/b", "/a"]);
  });

  it("ignores duplicates", () => {
    expect(mergeKnownRoots(["/a"], "/a")).toEqual(["/a"]);
  });
});

describe("resolveKnownRoot", () => {
  it("returns most specific matching root", () => {
    const roots = ["/project/src", "/project"];
    expect(resolveKnownRoot("/project/src/index.ts", roots)).toBe("/project/src");
  });

  it("returns null for no match", () => {
    expect(resolveKnownRoot("/other/file.ts", ["/project"])).toBeNull();
  });

  it("matches exact root", () => {
    expect(resolveKnownRoot("/project", ["/project"])).toBe("/project");
  });
});

describe("isWithin", () => {
  it("returns true for strict child", () => {
    expect(isWithin("/a", "/a/b")).toBe(true);
  });

  it("returns false for same path", () => {
    expect(isWithin("/a", "/a")).toBe(false);
  });

  it("returns false for sibling", () => {
    expect(isWithin("/a", "/b")).toBe(false);
  });
});

// biome-ignore lint/security/noSecrets: false positive on function name
describe("isWithinOrEqual", () => {
  it("returns true for strict child", () => {
    expect(isWithinOrEqual("/a", "/a/b")).toBe(true);
  });

  it("returns true for same path", () => {
    expect(isWithinOrEqual("/a", "/a")).toBe(true);
  });

  it("returns false for sibling", () => {
    expect(isWithinOrEqual("/a", "/b")).toBe(false);
  });
});

describe("byPathDepth", () => {
  it("sorts shallow before deep", () => {
    expect(byPathDepth("/a", "/a/b")).toBeLessThan(0);
    expect(byPathDepth("/a/b", "/a")).toBeGreaterThan(0);
  });

  it("falls back to localeCompare at same depth", () => {
    expect(byPathDepth("/b", "/a")).toBeGreaterThan(0);
  });
});

describe("segmentCount", () => {
  it("counts segments in absolute path", () => {
    expect(segmentCount("/a/b/c")).toBe(3);
  });

  it("handles trailing slash", () => {
    expect(segmentCount("/a/b/")).toBe(2);
  });
});
