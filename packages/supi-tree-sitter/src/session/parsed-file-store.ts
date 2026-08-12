import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import type { Query, Tree } from "web-tree-sitter";
import type { GrammarId } from "../types.ts";

/** Fixed internal limits for session-owned parsed files and compiled queries. */
export interface ParsedFileStoreLimits {
  readonly maxFileEntries: number;
  /** Maximum retained source size measured as UTF-8 bytes. */
  readonly maxSourceBytes: number;
  readonly maxQueryEntries: number;
  /** Maximum retained query-text size measured as UTF-8 bytes. */
  readonly maxQueryBytes: number;
}

/** Default bounded-cache limits. These values are not user configuration. */
export const DEFAULT_PARSED_FILE_STORE_LIMITS: ParsedFileStoreLimits = Object.freeze({
  maxFileEntries: 128,
  maxSourceBytes: 32 * 1024 * 1024,
  maxQueryEntries: 128,
  maxQueryBytes: 512 * 1024,
});

/** Sanitized cache facts attached to structural timing observations. */
export interface StructuralCacheObservation {
  readonly state: "hit" | "miss" | "replacement";
  readonly retained: boolean;
  readonly evictionCount: number;
}

interface ParsedFileOperations {
  readonly realpath: (filePath: string) => Promise<string>;
  readonly readFile: (filePath: string) => Promise<string>;
}

interface ParsedFileStoreOptions {
  readonly limits?: ParsedFileStoreLimits;
  readonly operations?: ParsedFileOperations;
}

interface AcquireParsedFileInput {
  readonly resolvedPath: string;
  readonly grammarId: GrammarId;
  readonly parse: (source: string) => Tree | Promise<Tree>;
  readonly onPhase?: (phase: "file-read" | "content-hash") => void;
}

/** One caller-owned parsed tree and its source facts. */
export interface OwnedParsedFile {
  readonly tree: Tree;
  readonly source: string;
  readonly resolvedPath: string;
  readonly grammarId: GrammarId;
  readonly cache: StructuralCacheObservation;
}

interface CachedParsedFile {
  readonly contentHash: string;
  readonly source: string;
  readonly sourceBytes: number;
  readonly tree: Tree;
}

interface CachedQuery {
  readonly query: Query;
  readonly queryBytes: number;
}

/** File-access failure from canonicalization or an asynchronous source read. */
export class ParsedFileReadError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = "ParsedFileReadError";
  }
}

/**
 * Own bounded canonical trees and compiled queries for one Tree-sitter runtime.
 *
 * Parsed-file freshness uses canonical path, grammar, and SHA-256 source hash.
 * Cached trees stay private. Each caller receives a shallow owned copy that it
 * must delete. Source and query UTF-8 byte counts are memory-related proxies
 * because web-tree-sitter does not report WASM resource sizes.
 */
export class ParsedFileStore {
  readonly #limits: ParsedFileStoreLimits;
  readonly #operations: ParsedFileOperations;
  readonly #files = new Map<string, CachedParsedFile>();
  readonly #queries = new Map<string, CachedQuery>();
  #sourceBytes = 0;
  #queryBytes = 0;
  #disposed = false;

  constructor(options: ParsedFileStoreOptions = {}) {
    this.#limits = options.limits ?? DEFAULT_PARSED_FILE_STORE_LIMITS;
    validateLimits(this.#limits);
    this.#operations = options.operations ?? {
      realpath,
      readFile: (filePath) => readFile(filePath, "utf-8"),
    };
  }

  /** Read one file asynchronously and return a caller-owned current tree. */
  async acquireParsedFile(input: AcquireParsedFileInput): Promise<OwnedParsedFile> {
    this.#assertActive();
    const canonicalPath = await this.#canonicalize(input.resolvedPath);
    this.#assertActive();
    const source = await this.#readSource(canonicalPath);
    this.#assertActive();
    notifyPhase(input.onPhase, "file-read");

    const contentHash = createHash("sha256").update(source).digest("hex");
    notifyPhase(input.onPhase, "content-hash");
    const key = fileKey(canonicalPath, input.grammarId);
    const existing = this.#files.get(key);

    if (existing?.contentHash === contentHash) {
      return this.#copyCacheHit(key, existing, canonicalPath, input.grammarId);
    }

    let parsedTree: Tree | undefined;
    try {
      parsedTree = await input.parse(source);
      this.#assertActive();
    } catch (error) {
      if (parsedTree) safeDelete(parsedTree);
      throw error;
    }

    const current = this.#files.get(key);
    if (current?.contentHash === contentHash) {
      safeDelete(parsedTree);
      parsedTree = undefined;
      return this.#copyCacheHit(key, current, canonicalPath, input.grammarId);
    }

    const state = current ? "replacement" : "miss";
    const sourceBytes = Buffer.byteLength(source, "utf-8");
    if (sourceBytes > this.#limits.maxSourceBytes) {
      if (current) this.#removeFile(key, current);
      return {
        tree: parsedTree,
        source,
        resolvedPath: canonicalPath,
        grammarId: input.grammarId,
        cache: { state, retained: false, evictionCount: 0 },
      };
    }

    if (current) this.#removeFile(key, current);
    const cached = { contentHash, source, sourceBytes, tree: parsedTree };
    this.#files.set(key, cached);
    this.#sourceBytes += sourceBytes;

    try {
      const evictionCount = this.#evictFiles();
      return this.#ownedCopy(cached, canonicalPath, input.grammarId, {
        state,
        retained: true,
        evictionCount,
      });
    } catch (error) {
      if (this.#files.get(key) === cached) this.#removeFile(key, cached);
      throw error;
    }
  }

  /**
   * Execute a callback with a compiled query owned by this store.
   *
   * The callback receives no `delete()` method. An oversized transient query is
   * deleted after the callback. Retained queries are deleted on eviction or
   * disposal.
   */
  withQuery<T>(
    grammarId: GrammarId,
    queryText: string,
    compile: () => Query,
    execute: (query: Pick<Query, "matches">, cache: StructuralCacheObservation) => T,
  ): { readonly data: T; readonly cache: StructuralCacheObservation } {
    this.#assertActive();
    const key = queryKey(grammarId, queryText);
    const existing = this.#queries.get(key);
    if (existing) {
      touch(this.#queries, key, existing);
      const cache = { state: "hit", retained: true, evictionCount: 0 } as const;
      return { data: execute(existing.query, cache), cache };
    }

    const query = compile();
    const queryBytes = Buffer.byteLength(queryText, "utf-8");
    if (queryBytes > this.#limits.maxQueryBytes) {
      const cache = { state: "miss", retained: false, evictionCount: 0 } as const;
      try {
        return { data: execute(query, cache), cache };
      } finally {
        safeDelete(query);
      }
    }

    const cached = { query, queryBytes };
    try {
      this.#queries.set(key, cached);
      this.#queryBytes += queryBytes;
      const evictionCount = this.#evictQueries();
      const cache = { state: "miss", retained: true, evictionCount } as const;
      return { data: execute(query, cache), cache };
    } catch (error) {
      if (this.#queries.get(key) === cached) this.#removeQuery(key, cached);
      throw error;
    }
  }

  /** Delete all canonical trees and compiled queries owned by this store. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#files.values()) safeDelete(entry.tree);
    for (const entry of this.#queries.values()) safeDelete(entry.query);
    this.#files.clear();
    this.#queries.clear();
    this.#sourceBytes = 0;
    this.#queryBytes = 0;
  }

  #copyCacheHit(
    key: string,
    cached: CachedParsedFile,
    canonicalPath: string,
    grammarId: GrammarId,
  ): OwnedParsedFile {
    touch(this.#files, key, cached);
    try {
      return this.#ownedCopy(cached, canonicalPath, grammarId, {
        state: "hit",
        retained: true,
        evictionCount: 0,
      });
    } catch (error) {
      this.#removeFile(key, cached);
      throw error;
    }
  }

  #ownedCopy(
    cached: CachedParsedFile,
    canonicalPath: string,
    grammarId: GrammarId,
    cache: StructuralCacheObservation,
  ): OwnedParsedFile {
    return {
      tree: cached.tree.copy(),
      source: cached.source,
      resolvedPath: canonicalPath,
      grammarId,
      cache,
    };
  }

  async #canonicalize(filePath: string): Promise<string> {
    try {
      return await this.#operations.realpath(filePath);
    } catch (error) {
      throw new ParsedFileReadError(fileReadMessage(error), { cause: error });
    }
  }

  async #readSource(filePath: string): Promise<string> {
    try {
      return await this.#operations.readFile(filePath);
    } catch (error) {
      throw new ParsedFileReadError(fileReadMessage(error), { cause: error });
    }
  }

  #evictFiles(): number {
    let evictionCount = 0;
    while (
      this.#files.size > this.#limits.maxFileEntries ||
      this.#sourceBytes > this.#limits.maxSourceBytes
    ) {
      const oldest = this.#files.entries().next().value;
      if (!oldest) break;
      this.#removeFile(oldest[0], oldest[1]);
      evictionCount++;
    }
    return evictionCount;
  }

  #evictQueries(): number {
    let evictionCount = 0;
    while (
      this.#queries.size > this.#limits.maxQueryEntries ||
      this.#queryBytes > this.#limits.maxQueryBytes
    ) {
      const oldest = this.#queries.entries().next().value;
      if (!oldest) break;
      this.#removeQuery(oldest[0], oldest[1]);
      evictionCount++;
    }
    return evictionCount;
  }

  #removeFile(key: string, entry: CachedParsedFile): void {
    if (!this.#files.delete(key)) return;
    this.#sourceBytes -= entry.sourceBytes;
    safeDelete(entry.tree);
  }

  #removeQuery(key: string, entry: CachedQuery): void {
    if (!this.#queries.delete(key)) return;
    this.#queryBytes -= entry.queryBytes;
    safeDelete(entry.query);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Parsed-file store has been disposed");
  }
}

function fileReadMessage(error: unknown): string {
  return error instanceof Error ? error.message : "File could not be read";
}

function validateLimits(limits: ParsedFileStoreLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer`);
    }
  }
}

function fileKey(canonicalPath: string, grammarId: GrammarId): string {
  return `${grammarId}\0${canonicalPath}`;
}

function queryKey(grammarId: GrammarId, queryText: string): string {
  return `${grammarId}\0${queryText}`;
}

function touch<K, V>(entries: Map<K, V>, key: K, value: V): void {
  entries.delete(key);
  entries.set(key, value);
}

function notifyPhase(
  observer: AcquireParsedFileInput["onPhase"],
  phase: "file-read" | "content-hash",
): void {
  try {
    observer?.(phase);
  } catch {
    // Instrumentation must not alter parsed-file behavior.
  }
}

function safeDelete(resource: { delete(): void }): void {
  try {
    resource.delete();
  } catch {
    // Continue deterministic cleanup of the remaining owned resources.
  }
}
