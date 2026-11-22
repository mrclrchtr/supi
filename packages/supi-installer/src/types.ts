/** Installer scope names match the two matrix columns. */
export type Scope = "project" | "global";
/** Preserve object entries, including fields not owned by the installer. */
export type PackageEntry = string | { source: string; [key: string]: unknown };
/** Paths used by inventory reads and Pi child commands. */
export interface Context {
  project: string;
  agentDir: string;
  home: string;
  settingsPaths: Record<Scope, string>;
}
/** One read-only observation of declarations and source restrictions. */
export interface Inventory {
  context: Context;
  entries: Record<Scope, PackageEntry[]>;
  blocked: Record<Scope, string[]>;
  unmanaged: Record<Scope, string[]>;
  files: Record<string, string | null>;
  fingerprint: string;
}
/** Catalog metadata is shipped with the CLI. */
export interface CatalogItem {
  name: string;
  description: string;
  labels: string[];
  recommended: boolean;
  obsolete?: boolean;
  /** Short user hint for the successor of an obsolete declaration. */
  replacement?: string;
}
/** A row retains the source entry separately from the draft selections. */
export interface MatrixRow {
  item: CatalogItem;
  initial: Record<Scope, PackageEntry | undefined>;
  selected: Record<Scope, boolean>;
}
/** A reviewed change to one direct declaration. */
export interface Operation {
  action: "install" | "remove";
  scope: Scope;
  name: string;
  source: string;
}
/** Child outcome includes errors that can occur before a process starts. */
export interface CommandResult {
  code: number;
  output: string;
}
/** The process boundary can use a fake Pi executable in tests. */
export type Runner = (
  args: string[],
  options: { cwd: string; signal: AbortSignal },
) => Promise<CommandResult>;
/** Report all planned operations, including those not attempted. */
export interface OperationResult {
  operation: Operation;
  status: "success" | "failed" | "unattempted";
  output: string;
}
/** Execution never promises rollback or a complete filesystem inventory. */
export interface ExecutionReport {
  results: OperationResult[];
  inventory?: Inventory;
  error?: string;
  cancelled: boolean;
  ok: boolean;
}
