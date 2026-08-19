import { type Dirent, promises as fs, type Stats } from "node:fs";
import * as path from "node:path";
import {
  getStructuralSearchSupportedExtensions,
  getSupportedExtensions,
  type StructuralSearchOperation,
} from "@mrclrchtr/supi-tree-sitter/api";
import { type DeadlineOutcome, type ScheduleDeadline, settleByDeadline } from "./deadline.ts";
import { relativeDisplayPath } from "./paths.ts";

/** Directory names excluded below an AST Scan root. */
export const AST_SCAN_EXCLUDED_DIRECTORIES = Object.freeze([
  ".git",
  ".pnpm",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  "__pycache__",
] as const);

const EXCLUDED_DIRECTORY_SET = new Set<string>(AST_SCAN_EXCLUDED_DIRECTORIES);

/** Default eligible-file safety cap for one AST Scan. */
export const DEFAULT_AST_SCAN_MAX_FILES = 5_000;
/** Default wall-clock deadline for AST enumeration plus analysis. */
export const DEFAULT_AST_SCAN_TIMEOUT_MS = 10_000;

export type AstScanExclusionReason =
  | "hidden-entry"
  | "excluded-directory"
  | "unsupported-extension"
  | "unsupported-operation"
  | "symlink"
  | "non-regular";

export type AstScanLimitationReason = "timeout" | "safety-limit" | "unreadable-path";

/** Bounded examples and exact encountered-path count for one policy exclusion. */
export interface AstScanExclusion {
  readonly reason: AstScanExclusionReason;
  readonly pathCount: number;
  readonly examples: readonly string[];
}

/** Runtime condition that prevented complete AST file enumeration. */
export interface AstScanLimitation {
  readonly reason: AstScanLimitationReason;
  readonly pathCount: number | null;
  readonly examples: readonly string[];
}

/** Declared deterministic policy for one AST Scan. */
export interface AstScanPolicy {
  readonly operation: StructuralSearchOperation;
  readonly supportedExtensions: readonly string[];
  readonly excludedDirectories: readonly string[];
  readonly hiddenEntries: "excluded";
  readonly ignoreFiles: false;
  readonly symlinks: "explicit-roots-only";
  readonly maxFiles: number;
  readonly timeoutMs: number;
}

/** Internal filesystem seam used to make enumeration failures deterministic in tests. */
export interface AstScanOperations {
  readonly realpath: (filePath: string) => Promise<string>;
  readonly stat: (filePath: string) => Promise<Stats>;
  readonly readDirectory: (directory: string) => Promise<Dirent[]>;
}

export interface EnumerateAstFilesOptions {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly operation: StructuralSearchOperation;
  readonly deadline: number;
  readonly maxFiles: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  /** Timer seam for deterministic deadline tests; defaults to wall-clock timers. */
  readonly schedule?: ScheduleDeadline;
  readonly operations?: AstScanOperations;
}

export type AstFileEnumeration =
  | {
      readonly kind: "completed";
      readonly files: readonly string[];
      /** Canonical cwd used to render canonical file paths consistently. */
      readonly displayBase: string;
      readonly eligibleFileCount: number | null;
      readonly complete: boolean;
      readonly policy: AstScanPolicy;
      readonly exclusions: readonly AstScanExclusion[];
      readonly limitations: readonly AstScanLimitation[];
    }
  | { readonly kind: "invalid-root"; readonly path: string; readonly reason: string };

/** Materialize the operation-aware policy disclosed in structured AST Scan details. */
export function astScanPolicy(
  operation: StructuralSearchOperation,
  maxFiles: number,
  timeoutMs: number,
): AstScanPolicy {
  return {
    operation,
    supportedExtensions: getStructuralSearchSupportedExtensions(operation).sort((a, b) =>
      a.localeCompare(b),
    ),
    excludedDirectories: [...AST_SCAN_EXCLUDED_DIRECTORIES],
    hiddenEntries: "excluded",
    ignoreFiles: false,
    symlinks: "explicit-roots-only",
    maxFiles,
    timeoutMs,
  };
}

const DEFAULT_OPERATIONS: AstScanOperations = {
  realpath: fs.realpath,
  stat: fs.stat,
  readDirectory: (directory) => fs.readdir(directory, { withFileTypes: true }),
};

interface MutableObservation<T extends string> {
  reason: T;
  pathCount: number;
  examples: string[];
}

/**
 * Enumerate the deterministic AST Scan universe behind one deep interface.
 *
 * Explicit roots are canonicalized and honored. Policy exclusions apply only
 * below directory roots. The shared deadline and eligible-file safety cap stop
 * traversal early, so interrupted scans deliberately leave the total unknown.
 */
export async function enumerateAstFiles(
  options: EnumerateAstFilesOptions,
): Promise<AstFileEnumeration> {
  return new AstFileEnumerator(options).run();
}

class AstFileEnumerator {
  readonly #operations: AstScanOperations;
  readonly #now: () => number;
  readonly #grammarExtensions = new Set(getSupportedExtensions());
  readonly #operationExtensions: ReadonlySet<string>;
  readonly #files = new Set<string>();
  readonly #visitedDirectories = new Set<string>();
  readonly #exclusions = new Map<
    AstScanExclusionReason,
    MutableObservation<AstScanExclusionReason>
  >();
  readonly #limitations = new Map<
    AstScanLimitationReason,
    MutableObservation<AstScanLimitationReason>
  >();
  #interrupted = false;
  #safetyLimited = false;
  #displayBase: string;

  constructor(readonly options: EnumerateAstFilesOptions) {
    this.#operations = options.operations ?? DEFAULT_OPERATIONS;
    this.#now = options.now ?? Date.now;
    this.#operationExtensions = new Set(getStructuralSearchSupportedExtensions(options.operation));
    this.#displayBase = path.resolve(options.cwd);
  }

  async run(): Promise<AstFileEnumeration> {
    this.options.signal?.throwIfAborted();
    await this.#resolveDisplayBase();
    for (const root of this.options.roots) {
      if (!this.#checkControl()) break;
      const invalid = await this.#processRoot(root);
      if (invalid) return invalid;
    }
    return this.#completedResult();
  }

  async #resolveDisplayBase(): Promise<void> {
    try {
      const outcome = await this.#settle(() => this.#operations.realpath(this.options.cwd));
      if (outcome.kind === "completed") this.#displayBase = outcome.value;
    } catch {
      this.options.signal?.throwIfAborted();
      // Scope validation owns cwd existence; retain the resolved fallback.
    }
  }

  async #processRoot(
    root: string,
  ): Promise<Extract<AstFileEnumeration, { kind: "invalid-root" }> | null> {
    let canonicalRoot: string;
    let rootStat: Stats;
    try {
      const realpathOutcome = await this.#settle(() => this.#operations.realpath(root));
      if (realpathOutcome.kind === "timeout") return null;
      canonicalRoot = realpathOutcome.value;
      const statOutcome = await this.#settle(() => this.#operations.stat(canonicalRoot));
      if (statOutcome.kind === "timeout") return null;
      rootStat = statOutcome.value;
    } catch {
      this.options.signal?.throwIfAborted();
      this.#record(this.#limitations, "unreadable-path", root);
      this.#interrupted = true;
      return null;
    }

    if (rootStat.isFile()) return this.#processFileRoot(canonicalRoot);
    if (rootStat.isDirectory()) {
      await this.#walk(canonicalRoot);
      return null;
    }
    return {
      kind: "invalid-root",
      path: this.#display(canonicalRoot),
      reason: "Explicit AST scope is not a regular file or directory.",
    };
  }

  #processFileRoot(
    canonicalRoot: string,
  ): Extract<AstFileEnumeration, { kind: "invalid-root" }> | null {
    const exclusion = this.#fileExclusion(canonicalRoot);
    if (exclusion === null) {
      this.#addFile(canonicalRoot);
      return null;
    }
    return {
      kind: "invalid-root",
      path: this.#display(canonicalRoot),
      reason:
        exclusion === "unsupported-extension"
          ? "Explicit AST file scope has no supported Tree-sitter grammar."
          : `Explicit AST file scope does not support the ${this.options.operation} operation.`,
    };
  }

  async #walk(directory: string): Promise<void> {
    if (!this.#checkControl() || this.#visitedDirectories.has(directory)) return;
    this.#visitedDirectories.add(directory);
    const entries = await this.#readDirectory(directory);
    if (!entries) return;
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!this.#checkControl()) return;
      await this.#processEntry(directory, entry);
    }
  }

  async #readDirectory(directory: string): Promise<Dirent[] | null> {
    try {
      const outcome = await this.#settle(() => this.#operations.readDirectory(directory));
      return outcome.kind === "completed" ? outcome.value : null;
    } catch {
      this.options.signal?.throwIfAborted();
      this.#record(this.#limitations, "unreadable-path", directory);
      this.#interrupted = true;
      return null;
    }
  }

  async #processEntry(directory: string, entry: Dirent): Promise<void> {
    const entryPath = path.join(directory, entry.name);
    const exclusion = this.#entryExclusion(entry);
    if (exclusion) {
      this.#record(this.#exclusions, exclusion, entryPath);
      return;
    }
    if (entry.isDirectory()) {
      await this.#walk(entryPath);
      return;
    }
    if (entry.isFile()) this.#addFile(entryPath);
  }

  #entryExclusion(entry: Dirent): AstScanExclusionReason | null {
    if (entry.name.startsWith(".")) return "hidden-entry";
    if (entry.isSymbolicLink()) return "symlink";
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORY_SET.has(entry.name) ? "excluded-directory" : null;
    }
    if (!entry.isFile()) return "non-regular";
    return this.#fileExclusion(entry.name);
  }

  #checkControl(): boolean {
    this.options.signal?.throwIfAborted();
    if (this.#safetyLimited) return false;
    if (this.#now() < this.options.deadline) return true;
    this.#markTimeout();
    return false;
  }

  async #settle<T>(operation: () => Promise<T>): Promise<DeadlineOutcome<T>> {
    const outcome = await settleByDeadline(operation, {
      deadline: this.options.deadline,
      now: this.#now,
      signal: this.options.signal,
      schedule: this.options.schedule,
    });
    if (outcome.kind === "timeout") this.#markTimeout();
    return outcome;
  }

  #markTimeout(): void {
    if (!this.#limitations.has("timeout")) {
      this.#record(this.#limitations, "timeout", this.#displayBase);
    }
    this.#interrupted = true;
  }

  #fileExclusion(
    filePath: string,
  ): Extract<AstScanExclusionReason, "unsupported-extension" | "unsupported-operation"> | null {
    const extension = path.extname(filePath).toLowerCase();
    if (!this.#grammarExtensions.has(extension)) return "unsupported-extension";
    return this.#operationExtensions.has(extension) ? null : "unsupported-operation";
  }

  #addFile(filePath: string): void {
    if (this.#files.has(filePath)) return;
    if (this.#files.size < this.options.maxFiles) {
      this.#files.add(filePath);
      return;
    }
    this.#limitations.set("safety-limit", {
      reason: "safety-limit",
      pathCount: 0,
      examples: [this.#display(filePath)],
    });
    this.#safetyLimited = true;
    this.#interrupted = true;
  }

  #display(filePath: string): string {
    return relativeDisplayPath(this.#displayBase, filePath, filePath);
  }

  #record<T extends string>(
    target: Map<T, MutableObservation<T>>,
    reason: T,
    filePath: string,
  ): void {
    const observation = target.get(reason) ?? { reason, pathCount: 0, examples: [] };
    observation.pathCount += 1;
    if (observation.examples.length < 5) observation.examples.push(this.#display(filePath));
    target.set(reason, observation);
  }

  #completedResult(): Extract<AstFileEnumeration, { kind: "completed" }> {
    const ordered = [...this.#files].sort((a, b) => a.localeCompare(b));
    return {
      kind: "completed",
      files: ordered,
      displayBase: this.#displayBase,
      eligibleFileCount: this.#interrupted ? null : ordered.length,
      complete: !this.#interrupted,
      policy: astScanPolicy(
        this.options.operation,
        this.options.maxFiles,
        this.options.timeoutMs ?? DEFAULT_AST_SCAN_TIMEOUT_MS,
      ),
      exclusions: [...this.#exclusions.values()],
      limitations: [...this.#limitations.values()].map((entry) => ({
        ...entry,
        pathCount:
          entry.reason === "timeout" || entry.reason === "safety-limit" ? null : entry.pathCount,
      })),
    };
  }
}
