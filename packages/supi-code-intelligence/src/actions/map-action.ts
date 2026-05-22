import * as fs from "node:fs";
import * as path from "node:path";
import type { CodeIntelResult, MapDetails } from "../types.ts";

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

interface FileStats {
  byExtension: Map<string, number>;
  byChildDir: Map<string, number>;
  landmarkFiles: string[];
  total: number;
}

export function executeMapAction(scopePath: string, cwd: string): CodeIntelResult {
  const stats = gatherStats(scopePath);
  const scope = formatScope(scopePath, cwd);
  const content = formatMap(scope, stats);
  const details: MapDetails = {
    scope,
    totalFiles: stats.total,
    childDirectoryCount: stats.byChildDir.size,
    landmarkCount: stats.landmarkFiles.length,
    nextQueries: ["`code_brief` for prioritized context on this scope"],
  };

  return { content, details: { type: "map", data: details } };
}

function gatherStats(scopePath: string): FileStats {
  const stats: FileStats = {
    byExtension: new Map<string, number>(),
    byChildDir: new Map<string, number>(),
    landmarkFiles: [],
    total: 0,
  };

  walkDirectory(scopePath, "", stats);
  return stats;
}

function walkDirectory(dir: string, rel: string, stats: FileStats): void {
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
  return entry.name.startsWith(".") || SKIP_DIRS.has(entry.name);
}

function visitEntry(dir: string, rel: string, entry: fs.Dirent, stats: FileStats): void {
  const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
  const fullPath = path.join(dir, entry.name);

  if (entry.isDirectory()) {
    walkDirectory(fullPath, entryRel, stats);
    return;
  }

  recordFileStats(entry.name, entryRel, stats);
}

function recordFileStats(entryName: string, entryRel: string, stats: FileStats): void {
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

function formatMap(scope: string, stats: FileStats): string {
  const lines: string[] = [];

  lines.push(`# Code Map: ${scope}`);
  lines.push("");
  lines.push(`**Files:** ${stats.total} total`);
  for (const [ext, count] of [...stats.byExtension.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    const label = SOURCE_EXTENSIONS.get(ext) ?? (ext || "(no extension)");
    lines.push(`- ${label}: ${count}`);
  }
  if (stats.byExtension.size > 10) {
    lines.push(`- _+${stats.byExtension.size - 10} more extensions_`);
  }
  lines.push("");

  if (stats.byChildDir.size > 0) {
    lines.push("**Child directories:**");
    for (const [dir, count] of [...stats.byChildDir.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${dir}/ (${count} file${count !== 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  if (stats.landmarkFiles.length > 0) {
    lines.push("**Landmark files:**");
    for (const file of stats.landmarkFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatScope(scopePath: string, cwd: string): string {
  const relative = path.relative(cwd, scopePath);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return scopePath;
  return relative.replaceAll(path.sep, "/");
}
