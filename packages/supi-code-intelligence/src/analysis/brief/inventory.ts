/**
 * Directory inventory collection — flat file counts by extension and landmark detection.
 *
 * Extracted from brief-focused.ts to keep the focus-generation modules
 * cohesive and avoid a single 800+ line file.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

/** Flat inventory of a directory tree. */
export interface DirectoryInventory {
  totalFiles: number;
  byExtension: Map<string, number>;
  landmarkFiles: string[];
}

// ── Public API ────────────────────────────────────────────────────────

/** Walk a directory tree collecting extension breakdown and landmark files. */
export function collectDirectoryInventory(dir: string): DirectoryInventory {
  const byExtension = new Map<string, number>();
  const landmarkFiles: string[] = [];
  const state = { totalFiles: 0, byExtension, landmarkFiles };

  function walk(currentPath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      processInventoryEntry(entry, currentPath, walk, state);
    }
  }

  walk(dir);
  landmarkFiles.sort((a, b) => a.localeCompare(b));
  return { totalFiles: state.totalFiles, byExtension, landmarkFiles };
}

/** Append inventory (extension breakdown + landmarks) to a lines array. */
export function addInventoryToLines(lines: string[], inventory: DirectoryInventory): void {
  if (inventory.totalFiles === 0) return;

  lines.push(`**Files:** ${inventory.totalFiles} total`);

  const sortedExts = [...inventory.byExtension.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [ext, count] of sortedExts) {
    const label = EXTENSION_LABELS.get(ext) ?? (ext || "(no extension)");
    lines.push(`- ${label}: ${count}`);
  }
  if (inventory.byExtension.size > 10) {
    lines.push(`- _+${inventory.byExtension.size - 10} more extensions_`);
  }

  if (inventory.landmarkFiles.length > 0) {
    const unique = [...new Set(inventory.landmarkFiles)].sort((a, b) => a.localeCompare(b));
    lines.push("");
    lines.push("**Landmark files:**");
    for (const f of unique) {
      lines.push(`- \`${f}\``);
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Process a single directory entry during inventory collection. */
function processInventoryEntry(
  entry: fs.Dirent,
  currentPath: string,
  walkFn: (p: string) => void,
  state: {
    totalFiles: number;
    byExtension: Map<string, number>;
    landmarkFiles: string[];
  },
): void {
  if (entry.name.startsWith(".") && entry.isDirectory()) return;
  if (SKIP_DIRS.has(entry.name)) return;
  if (entry.isDirectory()) {
    walkFn(path.join(currentPath, entry.name));
    return;
  }
  state.totalFiles++;
  const ext = path.extname(entry.name).toLowerCase();
  state.byExtension.set(ext, (state.byExtension.get(ext) ?? 0) + 1);
  if (LANDMARK_FILES.has(entry.name)) {
    state.landmarkFiles.push(entry.name);
  }
}

// ── Constants ─────────────────────────────────────────────────────────

/** Human-readable labels for common file extensions. */
const EXTENSION_LABELS: Map<string, string> = new Map([
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

/** Landmark files — well-known project configuration files. */
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

/** Skip these directories during flat inventory walks. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
