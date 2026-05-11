import * as fs from "node:fs";
import * as path from "node:path";

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

export function executeIndexAction(cwd: string): string {
  const stats = gatherStats(cwd);
  return formatIndex(stats, cwd);
}

interface FileStats {
  byExtension: Map<string, number>;
  byTopDir: Map<string, number>;
  landmarkFiles: string[];
  total: number;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

function shouldSkipEntry(entry: fs.Dirent): boolean {
  return entry.name.startsWith(".") || SKIP_DIRS.has(entry.name);
}

function gatherStats(cwd: string): FileStats {
  const byExtension = new Map<string, number>();
  const byTopDir = new Map<string, number>();
  const landmarkFiles: string[] = [];
  let total = 0;

  function processFile(entryRel: string, entryName: string) {
    total++;
    const ext = path.extname(entryName).toLowerCase();
    byExtension.set(ext, (byExtension.get(ext) ?? 0) + 1);

    const topDir = entryRel.split("/")[0] ?? ".";
    byTopDir.set(topDir, (byTopDir.get(topDir) ?? 0) + 1);

    if (LANDMARK_FILES.has(entryName)) {
      landmarkFiles.push(entryRel);
    }
  }

  function walk(dir: string, rel: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkipEntry(entry)) continue;

      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, entryRel);
      } else {
        processFile(entryRel, entry.name);
      }
    }
  }

  walk(cwd, "");
  return { byExtension, byTopDir, landmarkFiles, total };
}

function formatIndex(stats: FileStats, cwd: string): string {
  const lines: string[] = [];
  const name = path.basename(cwd);

  lines.push(`# Project Map: ${name}`);
  lines.push("");

  lines.push(`**Source files:** ${stats.total} total`);
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

  if (stats.byTopDir.size > 0) {
    lines.push("**Top-level directories:**");
    for (const [dir, count] of [...stats.byTopDir.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${dir}/ (${count} file${count !== 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  if (stats.landmarkFiles.length > 0) {
    lines.push("**Landmark files:**");
    for (const f of stats.landmarkFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
