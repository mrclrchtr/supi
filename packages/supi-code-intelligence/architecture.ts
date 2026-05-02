// Shared architecture model — scans project metadata to build a structural model
// that powers both auto-injected overviews and on-demand briefs.

import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot, isWithinOrEqual, walkProject } from "@mrclrchtr/supi-core";

// ── Types ─────────────────────────────────────────────────────────────

export interface ArchitectureModel {
  /** Absolute root directory of the project */
  root: string;
  /** Project name from root manifest */
  name: string | null;
  /** Project description from root manifest */
  description: string | null;
  /** Detected modules/packages */
  modules: ModuleInfo[];
  /** Internal dependency edges between modules */
  edges: DependencyEdge[];
}

export interface ModuleInfo {
  /** Package/module name */
  name: string;
  /** Short description from manifest */
  description: string | null;
  /** Absolute path to the module root */
  root: string;
  /** Relative path from project root */
  relativePath: string;
  /** Main entrypoint(s) from manifest */
  entrypoints: string[];
  /** Whether this is a leaf module (no internal dependents) */
  isLeaf: boolean;
  /** Internal dependency names */
  internalDeps: string[];
  /** External dependency names */
  externalDeps: string[];
}

export interface DependencyEdge {
  /** Source module name */
  from: string;
  /** Target module name */
  to: string;
}

// ── Low-signal path filtering ─────────────────────────────────────────

const LOW_SIGNAL_DIRS = new Set([
  "node_modules",
  ".git",
  ".pnpm",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  "__pycache__",
  ".tsbuildinfo",
]);

/** Check if a path segment indicates a low-signal artifact directory. */
export function isLowSignalPath(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.some((s) => LOW_SIGNAL_DIRS.has(s));
}

// ── Model building ────────────────────────────────────────────────────

const PROJECT_MARKERS = [
  "package.json",
  "pnpm-workspace.yaml",
  "deno.json",
  "deno.jsonc",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
];

/**
 * Build an architecture model from project metadata.
 * Starts from cheap manifest scanning — no deep AST or LSP analysis.
 */
export async function buildArchitectureModel(cwd: string): Promise<ArchitectureModel | null> {
  const root = findProjectRoot(cwd, PROJECT_MARKERS, cwd);

  // Read root manifest
  const rootManifest = readPackageJson(root);
  if (!rootManifest) {
    // Try to detect at least some source structure
    return buildMinimalModel(root);
  }

  const projectName = rootManifest.name ?? null;
  const projectDescription = rootManifest.description ?? null;

  // Detect workspace packages
  const workspaceModules = await detectWorkspaceModules(root, rootManifest);

  if (workspaceModules.length === 0) {
    // Single-package project
    return buildSinglePackageModel(root, rootManifest);
  }

  // Build dependency edges between workspace modules
  const moduleNames = new Set(workspaceModules.map((m) => m.name));
  const edges: DependencyEdge[] = [];

  for (const mod of workspaceModules) {
    for (const dep of mod.internalDeps) {
      if (moduleNames.has(dep)) {
        edges.push({ from: mod.name, to: dep });
      }
    }
  }

  // Mark leaf modules (no other module depends on them internally)
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

// ── Workspace detection ───────────────────────────────────────────────

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

function readPackageJson(dir: string): PackageJson | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: workspace package detection with manifest parsing
async function detectWorkspaceModules(
  root: string,
  rootManifest: PackageJson,
): Promise<ModuleInfo[]> {
  // Check for pnpm-workspace.yaml
  let workspaceGlobs: string[] = [];

  try {
    const pnpmWs = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8");
    // Simple YAML parsing for packages array
    const packagesMatch = pnpmWs.match(/packages:\s*\n((?:\s*-\s*.+\n?)*)/);
    if (packagesMatch) {
      workspaceGlobs = packagesMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\s*-\s*/, "").replace(/['"\s]/g, ""))
        .filter(Boolean);
    }
  } catch {
    // Try npm/yarn workspaces from package.json
    const ws = rootManifest.workspaces;
    if (Array.isArray(ws)) {
      workspaceGlobs = ws;
    } else if (ws && Array.isArray(ws.packages)) {
      workspaceGlobs = ws.packages;
    }
  }

  if (workspaceGlobs.length === 0) return [];

  // Resolve workspace globs to actual package directories
  const modules: ModuleInfo[] = [];
  const resolvedDirs = resolveWorkspaceGlobs(root, workspaceGlobs);

  for (const dir of resolvedDirs) {
    const manifest = readPackageJson(dir);
    if (!manifest?.name) continue;

    const relativePath = path.relative(root, dir);
    const allDeps = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    };

    // Separate internal vs external deps
    const internalDeps: string[] = [];
    const externalDeps: string[] = [];
    for (const depName of Object.keys(allDeps)) {
      // Internal if it matches a workspace package pattern
      const depVersion = allDeps[depName];
      if (depVersion?.startsWith("workspace:")) {
        internalDeps.push(depName);
      } else {
        externalDeps.push(depName);
      }
    }

    // Detect entrypoints
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
      isLeaf: false, // Will be computed after edges
      internalDeps,
      externalDeps,
    });
  }

  return modules;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: glob expansion with conditional directory scanning
function resolveWorkspaceGlobs(root: string, globs: string[]): string[] {
  const dirs: string[] = [];

  for (const glob of globs) {
    if (glob.includes("*")) {
      // Expand glob: "packages/*" -> list all dirs under packages/
      const prefix = glob.replace(/\/?\*.*$/, "");
      const baseDir = path.join(root, prefix);
      try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith(".")) continue;
          if (entry.name === "node_modules") continue;
          const fullPath = path.join(baseDir, entry.name);
          // Only include if it has a package.json
          if (fs.existsSync(path.join(fullPath, "package.json"))) {
            dirs.push(fullPath);
          }
        }
      } catch {
        // Glob base directory doesn't exist
      }
    } else {
      // Exact path
      const fullPath = path.join(root, glob);
      if (fs.existsSync(path.join(fullPath, "package.json"))) {
        dirs.push(fullPath);
      }
    }
  }

  return dirs;
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
    externalDeps: Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }),
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
  // Check if there are any recognizable source files
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

// ── Query helpers ─────────────────────────────────────────────────────

/**
 * Find the module containing a given file path.
 * Returns the most specific (deepest) matching module.
 */
export function findModuleForPath(model: ArchitectureModel, filePath: string): ModuleInfo | null {
  const resolved = path.resolve(filePath);
  let best: ModuleInfo | null = null;

  for (const mod of model.modules) {
    if (isWithinOrEqual(mod.root, resolved)) {
      if (!best || mod.root.length > best.root.length) {
        best = mod;
      }
    }
  }

  return best;
}

/**
 * Get modules that depend on a given module (reverse dependencies / dependents).
 */
export function getDependents(model: ArchitectureModel, moduleName: string): ModuleInfo[] {
  return model.modules.filter((m) => m.internalDeps.includes(moduleName));
}

/**
 * Get the internal dependencies of a module as ModuleInfo objects.
 */
export function getDependencies(model: ArchitectureModel, moduleName: string): ModuleInfo[] {
  const mod = model.modules.find((m) => m.name === moduleName);
  if (!mod) return [];
  return model.modules.filter((m) => mod.internalDeps.includes(m.name));
}
