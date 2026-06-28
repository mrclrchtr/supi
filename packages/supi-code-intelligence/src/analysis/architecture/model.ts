/**
 * Architecture model types and query helpers.
 *
 * Discovery logic lives in {@link ./discovery.ts}.
 */

import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";

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

// ── Query helpers ─────────────────────────────────────────────────────

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

export function getDependents(model: ArchitectureModel, moduleName: string): ModuleInfo[] {
  return model.modules.filter((m) => m.internalDeps.includes(moduleName));
}

export function getDependencies(model: ArchitectureModel, moduleName: string): ModuleInfo[] {
  const mod = model.modules.find((m) => m.name === moduleName);
  if (!mod) return [];
  return model.modules.filter((m) => mod.internalDeps.includes(m.name));
}
