// Compatibility wrapper for the shared project model now owned by
// @mrclrchtr/supi-code-runtime. Re-exports the canonical types and
// functions so downstream consumers (brief.ts, code-intelligence.ts,
// use-case modules) continue to work unchanged during the migration.

import {
  buildArchitectureModel as _buildArchitectureModel,
  findModuleForPath as _findModuleForPath,
  getDependencies as _getDependencies,
  getDependents as _getDependents,
} from "@mrclrchtr/supi-code-runtime/api";

export type {
  ArchitectureModel,
  DependencyEdge,
  ModuleInfo,
} from "@mrclrchtr/supi-code-runtime/api";

/** @deprecated Import from @mrclrchtr/supi-code-runtime/api directly. */
export const buildArchitectureModel = _buildArchitectureModel;

/** @deprecated Import from @mrclrchtr/supi-code-runtime/api directly. */
export const findModuleForPath = _findModuleForPath;

/** @deprecated Import from @mrclrchtr/supi-code-runtime/api directly. */
export const getDependents = _getDependents;

/** @deprecated Import from @mrclrchtr/supi-code-runtime/api directly. */
export const getDependencies = _getDependencies;
