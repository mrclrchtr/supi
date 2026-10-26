/**
 * Shared, presentation-neutral workspace observation types.
 *
 * These facts come from bounded filesystem inventory and explicitly parsed
 * project metadata. They do not describe runtime architecture, source roots,
 * installed dependency resolution, or inferred project roles.
 */

/** How the inventory selected files. */
export type InventorySource = "git" | "filesystem";

/** Inventory entries are regular files or symbolic links. Link targets are not followed. */
export type InventoryEntryKind = "file" | "symlink";

/** One workspace-relative inventory path. */
export interface InventoryEntry {
  /** Root-relative POSIX path. */
  readonly path: string;
  /** Filesystem entry kind observed without following symbolic links. */
  readonly kind: InventoryEntryKind;
}

/** Lower-level reason that stopped inventory traversal. */
export type InventoryStopReason = "complete" | "entry-limit" | "deadline";

/** Declared collection bounds for one observation. */
export interface CollectionLimits {
  /** Maximum number of inventory entries that collection may retain. */
  readonly maxEntries: number;
  /** Absolute Unix-epoch deadline, or null when the caller set no deadline. */
  readonly deadline: number | null;
}

/** Failure or limitation observed during collection. */
export interface WorkspaceObservationError {
  /** Collection stage that produced the error. */
  readonly stage: "inventory" | "metadata";
  /** Root-relative path, or null when no single path applies. */
  readonly path: string | null;
  /** Human-readable reason. */
  readonly reason: string;
}

/** Honest completeness state for one observation. */
export interface WorkspaceCollection {
  /** Complete only when inventory and all eligible metadata were read without limits or errors. */
  readonly status: "complete" | "partial";
  /** Lower-level inventory stop reason. */
  readonly stopReason: InventoryStopReason;
  /** Root-relative explicit directory visited first, or null for ordinary traversal. */
  readonly prioritizedDirectory: string | null;
  /** Bounds applied to this observation. */
  readonly limits: CollectionLimits;
  /** Inventory or metadata errors that affected completeness. */
  readonly errors: readonly WorkspaceObservationError[];
}

/** Explicit inclusion policy captured by one observation. */
export interface WorkspaceInclusionPolicy {
  /** How the inventory selected files. */
  readonly source: InventorySource;
  /** Caller-supplied Gitignore-style exclusion patterns. */
  readonly exclude: readonly string[];
  /** Whether Git-ignored untracked paths were included for an explicit focus. */
  readonly includeIgnored: boolean;
  /** Symbolic links are returned as entries, never traversed or read through. */
  readonly symlinks: "not-followed";
  /** No directory name is excluded by convention or inferred role. */
  readonly directoryNamesExcluded: false;
}

/** Parsed metadata file kinds supported by the shared observation. */
export type MetadataDocumentKind =
  | "package-json"
  | "pnpm-workspace"
  | "pyproject"
  | "cargo"
  | "go-mod"
  | "go-work";

/** Metadata read outcome retained for provenance. */
export interface MetadataDocument {
  /** Root-relative document path. */
  readonly path: string;
  readonly kind: MetadataDocumentKind;
  /** Parsed documents can establish declarations; skipped documents are symlinks or non-files. */
  readonly status: "parsed" | "failed" | "skipped";
  /** Failure or skip reason; null for parsed documents. */
  readonly reason: string | null;
}

/** Kind of unsupported, dynamic, inherited, or malformed metadata fact. */
export type MetadataIssueKind =
  | "malformed"
  | "unreadable"
  | "unsupported"
  | "dynamic"
  | "inherited"
  | "symlink"
  | "unresolved";

/** One disclosed metadata limitation with source provenance. */
export interface MetadataIssue {
  /** Root-relative document path. */
  readonly path: string;
  /** Exact field or directive path, or null for a document-wide issue. */
  readonly field: string | null;
  readonly kind: MetadataIssueKind;
  /** Why the declaration was not interpreted. */
  readonly reason: string;
}

/** Metadata documents and limitations from one observation. */
export interface WorkspaceMetadataObservation {
  readonly documents: readonly MetadataDocument[];
  readonly issues: readonly MetadataIssue[];
}

/** Native project declaration kinds supported by this collector. */
export type ProjectKind = "node-package" | "python-project" | "rust-package" | "go-module";

/** How one configuration explicitly established project membership. */
export interface ProjectMembership {
  /** Native workspace declaration family. */
  readonly kind: "node-workspace" | "cargo-workspace" | "go-work";
  /** Root-relative configuration or manifest path that declared membership. */
  readonly manifestPath: string;
  /** Exact declaring field or directive. */
  readonly field: string;
  /** Membership pattern or path exactly as declared. */
  readonly value: string;
}

/** A parsed workspace declaration, including unmatched patterns and exclusions. */
export interface WorkspaceDeclaration {
  readonly kind: ProjectMembership["kind"];
  readonly manifestPath: string;
  readonly directory: string;
  /** Native field or directive for the membership values. */
  readonly field: string;
  readonly patterns: readonly string[];
  /** Native exclusion field, or null when there is no separate exclusion field. */
  readonly excludeField: string | null;
  readonly excludes: readonly string[];
}

/** One path explicitly declared by project metadata. No field has entrypoint precedence. */
export interface DeclaredPath {
  /** Exact source field, including nested keys such as `exports["."]`. */
  readonly field: string;
  /** Path text exactly as declared. */
  readonly path: string;
}

/**
 * One dependency-family declaration.
 *
 * `field` keeps separate categories separate. `name` is the declared
 * dependency key or parsed requirement name. `value` is the exact parsed
 * declaration value and may be a string, array, or table.
 */
export interface DeclaredDependency {
  readonly field: string;
  readonly name: string;
  readonly value: unknown;
}

/** One explicitly declared local project relationship. */
export interface ProjectRelationship {
  /** Stable source project ID (its root-relative manifest path). */
  readonly from: string;
  /** Stable target project ID (its root-relative manifest path). */
  readonly to: string;
  /** Root-relative manifest that declared the relationship. */
  readonly manifestPath: string;
  /** Exact dependency field that declared the relationship. */
  readonly field: string;
  /** Exact declared dependency value. */
  readonly value: unknown;
}

/** One parsed project declaration with retained native provenance. */
export interface ProjectDeclaration {
  /** Stable identity: root-relative manifest path. Equal to `manifestPath`. */
  readonly id: string;
  /** Root-relative manifest path. */
  readonly manifestPath: string;
  readonly kind: ProjectKind;
  /** Root-relative project directory; `.` for the observation root. */
  readonly directory: string;
  /** Native identity value, or null when the manifest does not declare a usable value. */
  readonly name: string | null;
  /** Exact field that declared `name`, or null. */
  readonly nameField: string | null;
  /** One-line description when explicitly declared as a string. */
  readonly description: string | null;
  /** Exact field that declared `description`, or null. */
  readonly descriptionField: string | null;
  /** Explicit workspace memberships; this is not inferred from directory adjacency. */
  readonly memberships: readonly ProjectMembership[];
  /** Explicitly declared paths with their source fields. */
  readonly declaredPaths: readonly DeclaredPath[];
  /** Explicit dependency declarations, grouped by their exact source fields. */
  readonly dependencies: readonly DeclaredDependency[];
}

/** Inventory and its source policy. */
export interface WorkspaceInventory {
  readonly source: InventorySource;
  readonly entries: readonly InventoryEntry[];
}

/** Immutable result of one bounded workspace observation. */
export interface WorkspaceObservation {
  /** Absolute requested working directory. It is never widened to an ancestor. */
  readonly root: string;
  /** Runtime-reported structure from one separately authorized selected build. */
  readonly gradle?: import("../gradle/types.ts").GradleObservation;
  readonly inventory: WorkspaceInventory;
  readonly inclusion: WorkspaceInclusionPolicy;
  readonly collection: WorkspaceCollection;
  readonly metadata: WorkspaceMetadataObservation;
  readonly projects: readonly ProjectDeclaration[];
  readonly workspaces: readonly WorkspaceDeclaration[];
  /** Declared local relationships between uniquely identified projects. */
  readonly relationships: readonly ProjectRelationship[];
}

/** Bounded collection controls for `observeWorkspace`. */
export interface ObserveWorkspaceOptions {
  /** Additional Gitignore-style exclusions, matched relative to the requested root. */
  readonly exclude?: readonly string[];
  /**
   * Include Git-ignored untracked paths. Use this for an explicit directory
   * focus whose ignored contents must remain inspectable.
   */
  readonly includeIgnored?: boolean;
  /** Maximum retained inventory entries. Defaults to 10,000. */
  readonly maxEntries?: number;
  /** Explicit in-root directory to collect before spending the inventory budget elsewhere. */
  readonly prioritizeDirectory?: string;
  /**
   * Caller cancellation and absolute deadline. Cancellation throws the abort
   * reason; a reached deadline returns an honest partial observation.
   */
  readonly control?: import("@mrclrchtr/supi-code-runtime/api").CodeRequestControl;
}
