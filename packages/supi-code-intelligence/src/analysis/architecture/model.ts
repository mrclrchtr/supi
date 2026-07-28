/** Direct manifest and workspace-configuration facts for Orientation and the session overview. */

import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";

/** Completion state for one directly observed architecture collection. */
export type ArchitectureObservationStatus = "complete" | "partial" | "unavailable";

/** Manifest fields whose values are surfaced without assigning a derived role. */
export interface ManifestField {
  /** Exact field path in the package manifest, such as `exports` or `pi.extensions`. */
  readonly field: string;
  /** JSON value declared at that field. */
  readonly value: unknown;
}

/** One dependency declaration from an exact package-manifest section. */
export interface ManifestDependency {
  /** Source package.json field. */
  readonly field: ManifestDependencyField;
  /** Dependency name as declared in the manifest object key. */
  readonly name: string;
  /** Version/range value as declared in the manifest object value. */
  readonly specifier: unknown;
}

/** Dependency-map fields whose entries may declare package relationships. */
export type ManifestDependencyField =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

/** One dependency-map field retained with its source field name. */
export interface ManifestDependencySection {
  /** Source package.json field. */
  readonly field: ManifestDependencyField;
  /** Every directly declared dependency entry in the section. */
  readonly entries: readonly ManifestDependency[];
}

/** Facts from one successfully parsed package.json file. */
export interface ModuleInfo {
  /** Package name from package.json; null when the manifest omits a string name. */
  readonly name: string | null;
  /** Package description from package.json when it is a string. */
  readonly description: string | null;
  /** Absolute package directory. */
  readonly root: string;
  /** Package directory relative to the orientation root. */
  readonly relativePath: string;
  /** Package manifest path relative to the orientation root. */
  readonly manifestPath: string;
  /** Directly declared non-dependency manifest fields. */
  readonly fields: readonly ManifestField[];
  /** Directly declared dependency-map sections. */
  readonly dependencySections: readonly ManifestDependencySection[];
}

/** Result of reading the root package manifest. */
export interface PackageManifestObservation {
  /** Whether the root package manifest was read and parsed. */
  readonly status: ArchitectureObservationStatus;
  /** Root-relative path of the expected manifest. */
  readonly path: string;
  /** Failure explanation when the manifest is partial or unavailable. */
  readonly reason: string | null;
  /** Parsed package facts when available. */
  readonly package: ModuleInfo | null;
}

/** Configuration file and field that declared workspace membership. */
export interface WorkspaceTopologySource {
  /** Root-relative configuration file path. */
  readonly path: string;
  /** Exact configuration field. */
  readonly field: string;
}

/** Directly observed package-topology collection state. */
export interface WorkspaceTopology {
  /** Whether this is a workspace declaration, one root package, or unavailable metadata. */
  readonly kind: "workspace" | "single-package" | "unavailable";
  /** Collection completion state. */
  readonly status: ArchitectureObservationStatus;
  /** Configuration source that declared workspace membership, when applicable. */
  readonly source: WorkspaceTopologySource | null;
  /** Failure explanation when discovery was partial or unavailable. */
  readonly reason: string | null;
  /** Package manifests matched by configuration but not successfully parsed. */
  readonly failedPackageManifestCount: number;
}

/** One manifest-declared dependency whose name matches exactly one discovered package. */
export interface DependencyEdge {
  /** Declaring package name. */
  readonly from: string;
  /** Declared package name that identifies one discovered package. */
  readonly to: string;
  /** Exact dependency-map field that declared the relationship. */
  readonly field: ManifestDependencyField;
  /** Declared version/range value. */
  readonly specifier: unknown;
  /** Root-relative manifest that declared the relationship. */
  readonly manifestPath: string;
}

/**
 * Factual package and workspace observations.
 *
 * `modules` and `edges` describe manifest declarations only; they are not a
 * runtime architecture graph.
 */
export interface ArchitectureModel {
  /** Absolute supported workspace root, or the requested cwd when no supported metadata exists. */
  readonly root: string;
  /** Root package manifest observation. */
  readonly rootManifest: PackageManifestObservation;
  /** Workspace membership observation. */
  readonly topology: WorkspaceTopology;
  /** Parsed package manifests declared by the selected topology. */
  readonly modules: readonly ModuleInfo[];
  /** Manifest-declared dependencies between uniquely discovered packages. */
  readonly edges: readonly DependencyEdge[];
  /** Root package name when directly declared. */
  readonly name: string | null;
  /** Root package description when directly declared. */
  readonly description: string | null;
}

/** Find the most specific discovered package containing a filesystem path. */
export function findModuleForPath(model: ArchitectureModel, filePath: string): ModuleInfo | null {
  const resolved = path.resolve(filePath);
  let best: ModuleInfo | null = null;

  for (const mod of model.modules) {
    if (isWithinOrEqual(mod.root, resolved) && (!best || mod.root.length > best.root.length)) {
      best = mod;
    }
  }

  return best;
}
