/**
 * Architecture model discovery — scans project metadata to build a structural
 * workspace model for auto-injected overviews and on-demand briefs.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot, walkProject } from "@mrclrchtr/supi-core/project";
import type { ArchitectureModel, DependencyEdge, ModuleInfo } from "./model.ts";

// ── Constants ─────────────────────────────────────────────────────────

const PROJECT_MARKERS = [
  "package.json",
  "pnpm-workspace.yaml",
  "deno.json",
  "deno.jsonc",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
];

interface PackageJson {
  name?: string;
  description?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  pi?: { extensions?: string[] };
}

// ── Public entry point ────────────────────────────────────────────────

/**
 * Build an architecture model from project metadata.
 * Starts from cheap manifest scanning — no deep AST or LSP analysis.
 */
export async function buildArchitectureModel(cwd: string): Promise<ArchitectureModel | null> {
  const root = findProjectRoot(cwd, PROJECT_MARKERS, cwd);
  const rootManifest = readPackageJson(root);

  if (!rootManifest) {
    return buildMinimalModel(root);
  }

  const projectName = rootManifest.name ?? null;
  const projectDescription = rootManifest.description ?? null;
  const workspaceModules = await detectWorkspaceModules(root, rootManifest);

  if (workspaceModules.length === 0) {
    return buildSinglePackageModel(root, rootManifest);
  }

  const moduleNames = new Set(workspaceModules.map((m) => m.name));
  const edges: DependencyEdge[] = [];

  for (const mod of workspaceModules) {
    for (const dep of mod.internalDeps) {
      if (moduleNames.has(dep)) {
        edges.push({ from: mod.name, to: dep });
      }
    }
  }

  const dependedOn = new Set(edges.map((e) => e.to));
  for (const mod of workspaceModules) {
    mod.isLeaf = !dependedOn.has(mod.name);
  }

  return {
    root,
    name: projectName,
    description: projectDescription,
    modules: workspaceModules,
    edges,
  };
}

// ── Manifest reading ──────────────────────────────────────────────────

function readPackageJson(dir: string): PackageJson | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Workspace detection ───────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: workspace detection with manifest parsing
async function detectWorkspaceModules(
  root: string,
  rootManifest: PackageJson,
): Promise<ModuleInfo[]> {
  let workspaceGlobs: string[] = [];

  try {
    const pnpmWs = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8");
    const packagesMatch = pnpmWs.match(/packages:\s*\n((?:\s*-\s*.+\n?)*)/);
    if (packagesMatch) {
      workspaceGlobs = packagesMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\s*-\s*/, "").replace(/['"\s]/g, ""))
        .filter(Boolean);
    }
  } catch {
    const ws = rootManifest.workspaces;
    if (Array.isArray(ws)) {
      workspaceGlobs = ws;
    } else if (ws && Array.isArray(ws.packages)) {
      workspaceGlobs = ws.packages;
    }
  }

  if (workspaceGlobs.length === 0) return [];

  const modules: ModuleInfo[] = [];
  const resolvedDirs = resolveWorkspaceGlobs(root, workspaceGlobs);

  for (const dir of resolvedDirs) {
    const manifest = readPackageJson(dir);
    if (!manifest?.name) continue;

    const relativePath = path.relative(root, dir);
    const allDeps = { ...manifest.dependencies, ...manifest.peerDependencies };

    const internalDeps: string[] = [];
    const externalDeps: string[] = [];
    for (const depName of Object.keys(allDeps)) {
      const depVersion = allDeps[depName];
      if (depVersion?.startsWith("workspace:")) {
        internalDeps.push(depName);
      } else {
        externalDeps.push(depName);
      }
    }

    const entrypoints: string[] = [];
    if (manifest.pi?.extensions) {
      entrypoints.push(...manifest.pi.extensions);
    } else if (manifest.main) {
      entrypoints.push(manifest.main);
    } else if (manifest.module) {
      entrypoints.push(manifest.module);
    }

    modules.push({
      name: manifest.name,
      description: manifest.description ?? null,
      root: dir,
      relativePath,
      entrypoints,
      isLeaf: false,
      internalDeps,
      externalDeps,
    });
  }

  return modules;
}

function resolveWorkspaceGlobs(root: string, globs: string[]): string[] {
  const dirs: string[] = [];

  for (const glob of globs) {
    if (glob.includes("*")) {
      const prefix = glob.replace(/\/?\*.*$/, "");
      const baseDir = path.join(root, prefix);
      const recursive = glob.includes("**");
      try {
        collectPackageDirs(baseDir, dirs, recursive ? 5 : 0);
      } catch {
        // Glob base directory doesn't exist
      }
    } else {
      const fullPath = path.join(root, glob);
      if (fs.existsSync(path.join(fullPath, "package.json"))) {
        dirs.push(fullPath);
      }
    }
  }

  return dirs;
}

function collectPackageDirs(baseDir: string, dirs: string[], depth: number): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const fullPath = path.join(baseDir, entry.name);
    if (fs.existsSync(path.join(fullPath, "package.json"))) {
      dirs.push(fullPath);
    } else if (depth > 0) {
      collectPackageDirs(fullPath, dirs, depth - 1);
    }
  }
}

// ── Fallback models ───────────────────────────────────────────────────

function buildSinglePackageModel(root: string, manifest: PackageJson): ArchitectureModel {
  const entrypoints: string[] = [];
  if (manifest.pi?.extensions) {
    entrypoints.push(...manifest.pi.extensions);
  } else if (manifest.main) {
    entrypoints.push(manifest.main);
  }

  const mod: ModuleInfo = {
    name: manifest.name ?? path.basename(root),
    description: manifest.description ?? null,
    root,
    relativePath: ".",
    entrypoints,
    isLeaf: true,
    internalDeps: [],
    externalDeps: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
  };

  return {
    root,
    name: manifest.name ?? null,
    description: manifest.description ?? null,
    modules: [mod],
    edges: [],
  };
}

function buildMinimalModel(root: string): ArchitectureModel | null {
  let hasSource = false;
  walkProject(root, 2, (_dir, entries) => {
    for (const name of entries) {
      if (
        name.endsWith(".ts") ||
        name.endsWith(".js") ||
        name.endsWith(".tsx") ||
        name.endsWith(".jsx") ||
        name.endsWith(".py") ||
        name.endsWith(".rs") ||
        name.endsWith(".go")
      ) {
        hasSource = true;
      }
    }
  });

  if (!hasSource) return null;

  return {
    root,
    name: path.basename(root),
    description: null,
    modules: [],
    edges: [],
  };
}
