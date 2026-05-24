// Map use-case — typed filesystem scanning for factual project/directory inventory.
// Produces structured data for the markdown renderer.

import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────

export interface MapStats {
  byExtension: Map<string, number>;
  byChildDir: Map<string, number>;
  landmarkFiles: string[];
  total: number;
}

export interface MapData {
  scope: string;
  stats: MapStats;
}

const SOURCE_EXTENSIONS = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TSX"],
  [".js", "JavaScript"],
  [".jsx", "JSX"],
  [".mts", "TypeScript"],
  [".cts", "TypeScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".py", "Python"],
  [".pyi", "Python"],
  [".rs", "Rust"],
  [".go", "Go"],
  [".mod", "Go"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".kts", "Kotlin"],
  [".rb", "Ruby"],
  [".php", "PHP"],
  [".swift", "Swift"],
  [".cpp", "C++"],
  [".hpp", "C++"],
  [".cc", "C++"],
  [".cxx", "C++"],
  [".hxx", "C++ Header"],
  [".c++", "C++"],
  [".h++", "C++ Header"],
  [".c", "C"],
  [".h", "C Header"],
  [".css", "CSS"],
  [".scss", "SCSS"],
  [".less", "Less"],
  [".html", "HTML"],
  [".htm", "HTML"],
  [".xhtml", "HTML"],
  [".json", "JSON"],
  [".yaml", "YAML"],
  [".yml", "YAML"],
  [".toml", "TOML"],
  [".md", "Markdown"],
  [".sh", "Shell"],
  [".bash", "Shell"],
  [".zsh", "Shell"],
  [".r", "R"],
  [".sql", "SQL"],
  [".cs", "C#"],
]);

const LANDMARK_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "jest.config.ts",
  "playwright.config.ts",
  "biome.json",
  "eslint.config.js",
  ".eslintrc.js",
  "deno.json",
  "deno.jsonc",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Makefile",
  "justfile",
  "Taskfile.yml",
  "Dockerfile",
  "docker-compose.yml",
  ".env.example",
  ".env.local.example",
]);

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

// ── Public entrypoint ────────────────────────────────────────────────

export function buildMapData(scopePath: string, cwd: string): MapData {
  const stats = gatherStats(scopePath);
  const scope = formatScope(scopePath, cwd);
  return { scope, stats };
}

function gatherStats(scopePath: string): MapStats {
  const stats: MapStats = {
    byExtension: new Map<string, number>(),
    byChildDir: new Map<string, number>(),
    landmarkFiles: [],
    total: 0,
  };

  walkDirectory(scopePath, "", stats);
  return stats;
}

function walkDirectory(dir: string, rel: string, stats: MapStats): void {
  const entries = readEntries(dir);
  if (!entries) return;

  for (const entry of entries) {
    if (shouldSkipEntry(entry)) continue;
    visitEntry(dir, rel, entry, stats);
  }
}

function readEntries(dir: string): fs.Dirent[] | null {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

function shouldSkipEntry(entry: fs.Dirent): boolean {
  // Skip hidden directories and node_modules, but keep dot-prefixed landmark files
  if (entry.name.startsWith(".") && entry.isDirectory()) return true;
  return SKIP_DIRS.has(entry.name);
}

function visitEntry(dir: string, rel: string, entry: fs.Dirent, stats: MapStats): void {
  const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
  const fullPath = path.join(dir, entry.name);

  if (entry.isDirectory()) {
    walkDirectory(fullPath, entryRel, stats);
    return;
  }

  recordFileStats(entry.name, entryRel, stats);
}

function recordFileStats(entryName: string, entryRel: string, stats: MapStats): void {
  stats.total++;
  const ext = path.extname(entryName).toLowerCase();
  stats.byExtension.set(ext, (stats.byExtension.get(ext) ?? 0) + 1);

  const firstSegment = entryRel.split("/")[0];
  if (firstSegment && entryRel.includes("/")) {
    stats.byChildDir.set(firstSegment, (stats.byChildDir.get(firstSegment) ?? 0) + 1);
  }

  if (LANDMARK_FILES.has(entryName)) {
    stats.landmarkFiles.push(entryRel);
  }
}

function formatScope(scopePath: string, cwd: string): string {
  const relative = path.relative(cwd, scopePath);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return scopePath;
  return relative.replaceAll(path.sep, "/");
}

export { SOURCE_EXTENSIONS };
