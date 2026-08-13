// biome-ignore-all lint/style/noExcessiveLinesPerFile: raw parser and query ownership stays in one Worker-only module
// Tree-sitter runtime — parser management, parse, and query services.

import * as path from "node:path";
import { resolveToolPath } from "@mrclrchtr/supi-core/path";
import type { Language, Parser, Tree } from "web-tree-sitter";
import { detectGrammar, resolveGrammarWasmPath } from "../language.ts";
import {
  finishStructuralTiming,
  type ParseTimingPhase,
  type QueryTimingPhase,
  type StructuralTimingEvent,
  startStructuralTiming,
} from "../session/structural-timing.ts";
import type { GrammarId, QueryCapture, TreeSitterResult } from "../types.ts";
import {
  ParsedFileReadError,
  ParsedFileStore,
  type StructuralCacheObservation,
} from "./parsed-file-store.ts";
import {
  isStructuralRequestInterrupted,
  isStructuralRequestInterruption,
  type StructuralRequestControl,
  throwIfStructuralRequestInterrupted,
} from "./request-control.ts";
import { resetInterruptedParser } from "./runtime-parser-helpers.ts";
import {
  collectQueryCaptures,
  formatRuntimeError,
  validateQueryString,
} from "./runtime-query-helpers.ts";

interface ParserEntry {
  parser: Parser;
  language: Language;
}

const QUERY_PARSED_FILE = Symbol("query-parsed-file");

interface ParsedQueryInput {
  readonly grammarId: GrammarId;
  readonly tree: Tree;
  readonly source: string;
  readonly queryString: string;
  readonly control?: StructuralRequestControl;
}

/**
 * Session-scoped Tree-sitter runtime.
 *
 * A runtime owns the expensive `web-tree-sitter` initialization and parser
 * instances for one pi working directory. Call `dispose()` when the session is
 * torn down so WASM parser resources are released.
 */
export class TreeSitterRuntime {
  private parserModule: typeof import("web-tree-sitter") | undefined;
  private parsers = new Map<GrammarId, ParserEntry>();
  private parsedFiles = new ParsedFileStore();
  private parserPromises = new Map<GrammarId, Promise<ParserEntry>>();
  private initPromise: Promise<typeof import("web-tree-sitter")> | undefined;
  private initializing = false;
  private disposed = false;

  /** Create a runtime that resolves relative file paths from `cwd`. */
  constructor(
    private cwd: string,
    private onTiming?: (event: StructuralTimingEvent) => void,
  ) {}

  /** Ensure web-tree-sitter Parser is initialized. */
  private async ensureParserInit(): Promise<typeof import("web-tree-sitter")> {
    this.assertActive();
    if (this.parserModule) return this.parserModule;
    if (this.initializing && this.initPromise) return this.initPromise;

    this.initializing = true;
    this.initPromise = (async () => {
      const mod = await import("web-tree-sitter");
      await mod.Parser.init();
      this.assertActive();
      this.parserModule = mod;
      return mod;
    })();

    try {
      return await this.initPromise;
    } catch (err: unknown) {
      // Allow retry on next call
      this.initPromise = undefined;
      this.initializing = false;
      throw new Error("Failed to initialize web-tree-sitter", { cause: err });
    }
  }

  /**
   * Get or create a parser entry for a grammar.
   *
   * Concurrent first-use calls for the same grammar share one initialization
   * promise. Failed initialization is not cached, so a later request can retry.
   */
  async ensureGrammarParser(grammarId: GrammarId): Promise<ParserEntry> {
    this.assertActive();
    const existing = this.parsers.get(grammarId);
    if (existing) return existing;

    const pending = this.parserPromises.get(grammarId);
    if (pending) return pending;

    const promise = this.createGrammarParser(grammarId);
    this.parserPromises.set(grammarId, promise);

    try {
      return await promise;
    } finally {
      if (this.parserPromises.get(grammarId) === promise) {
        this.parserPromises.delete(grammarId);
      }
    }
  }

  private async createGrammarParser(grammarId: GrammarId): Promise<ParserEntry> {
    const mod = await this.ensureParserInit();
    const wasmPath = resolveGrammarWasmPath(grammarId);

    const language = await mod.Language.load(wasmPath);
    const parser = new mod.Parser();
    try {
      parser.setLanguage(language);
    } catch (err) {
      deleteWasmResource(parser);
      throw err;
    }

    if (this.disposed) {
      deleteWasmResource(parser);
      throw new Error("Tree-sitter runtime has been disposed");
    }

    const entry = { parser, language };
    this.parsers.set(grammarId, entry);
    return entry;
  }

  /**
   * Read and parse a file.
   *
   * The returned tree is an owned shallow copy. The caller must delete it.
   * Canonical cached trees never leave the parsed-file store.
   */
  async parseFile(
    filePath: string,
    control?: StructuralRequestControl,
  ): Promise<
    TreeSitterResult<{
      tree: Tree;
      source: string;
      resolvedPath: string;
      grammarId: GrammarId;
    }>
  > {
    const resolvedPath = resolveToolPath(this.cwd, filePath);
    const grammarId = detectGrammar(filePath);
    if (!grammarId) {
      return {
        kind: "unsupported-language",
        file: filePath,
        message: `No Tree-sitter grammar configured for ${path.extname(filePath) || "this file type"}`,
      };
    }

    const timer = startStructuralTiming(control?.operationId, this.onTiming);
    const parserState = this.parsers.has(grammarId)
      ? "reused"
      : this.parserPromises.has(grammarId)
        ? "initializing"
        : "cold";
    let finalPhase: ParseTimingPhase = "file-read";

    try {
      const parsed = await this.parsedFiles.acquireParsedFile({
        resolvedPath,
        grammarId,
        control,
        onPhase: (phase) => {
          timer.mark(phase);
          finalPhase = phase === "file-read" ? "content-hash" : "cache-lookup";
        },
        parse: async (source) => {
          finalPhase = "parser-setup";
          let entry = await this.ensureGrammarParser(grammarId);
          this.assertActive();
          throwIfStructuralRequestInterrupted(control);
          if (this.parsers.get(grammarId) !== entry) {
            entry = await this.ensureGrammarParser(grammarId);
            this.assertActive();
            throwIfStructuralRequestInterrupted(control);
          }
          timer.mark("parser-setup");
          finalPhase = "parse";
          const tree = entry.parser.parse(source, undefined, {
            progressCallback: () => isStructuralRequestInterrupted(control),
          });
          if (!tree) {
            resetInterruptedParser(this.parsers, grammarId, entry);
            throwIfStructuralRequestInterrupted(control);
            throw new Error("Tree-sitter parser did not produce a tree");
          }
          try {
            throwIfStructuralRequestInterrupted(control);
            return tree;
          } catch (error) {
            tree.delete();
            throw error;
          }
        },
      });
      finishStructuralTiming(timer, {
        operation: "parse",
        grammar: grammarId,
        parserState,
        outcome: "completed",
        cache: parsed.cache,
        finalPhase,
      });
      return {
        kind: "success",
        data: {
          tree: parsed.tree,
          source: parsed.source,
          resolvedPath: parsed.resolvedPath,
          grammarId: parsed.grammarId,
        },
      };
    } catch (err: unknown) {
      if (isStructuralRequestInterruption(err, control)) {
        finishStructuralTiming(timer, {
          operation: "parse",
          grammar: grammarId,
          parserState,
          outcome: control?.signal?.aborted ? "cancelled" : "timeout",
          finalPhase,
        });
        throw err;
      }
      if (err instanceof ParsedFileReadError) {
        finishStructuralTiming(timer, {
          operation: "parse",
          grammar: grammarId,
          parserState,
          outcome: "file-access-error",
          finalPhase: "file-read",
        });
        return { kind: "file-access-error", file: filePath, message: err.message };
      }
      finishStructuralTiming(timer, {
        operation: "parse",
        grammar: grammarId,
        parserState,
        outcome: "runtime-error",
        finalPhase,
      });
      return {
        kind: "runtime-error",
        message: formatRuntimeError(err, "Parser initialization failed"),
      };
    }
  }

  /** Execute a Tree-sitter query against a file. */
  async queryFile(
    filePath: string,
    queryString: string,
    control?: StructuralRequestControl,
  ): Promise<TreeSitterResult<QueryCapture[]>> {
    const validation = validateQueryString(queryString);
    if (validation) return validation;

    const parseResult = await this.parseFile(filePath, control);
    if (parseResult.kind !== "success") return parseResult;

    const { grammarId, tree, source } = parseResult.data;
    try {
      return await this[QUERY_PARSED_FILE]({ grammarId, tree, source, queryString, control });
    } finally {
      tree.delete();
    }
  }

  /** Execute a query against one caller-owned parsed tree without parsing again. */
  async [QUERY_PARSED_FILE](input: ParsedQueryInput): Promise<TreeSitterResult<QueryCapture[]>> {
    const { grammarId, tree, source, queryString, control } = input;
    const validation = validateQueryString(queryString);
    if (validation) return validation;

    const timer = startStructuralTiming(control?.operationId, this.onTiming);
    let phase: QueryTimingPhase = "query-compilation";
    let compilationStarted = false;
    let cache: StructuralCacheObservation = {
      state: "miss",
      retained: false,
      evictionCount: 0,
    };

    try {
      let entry = await this.ensureGrammarParser(grammarId);
      this.assertActive();
      throwIfStructuralRequestInterrupted(control);
      if (this.parsers.get(grammarId) !== entry) {
        entry = await this.ensureGrammarParser(grammarId);
        this.assertActive();
        throwIfStructuralRequestInterrupted(control);
      }
      const mod = await this.ensureParserInit();
      this.assertActive();
      throwIfStructuralRequestInterrupted(control);
      compilationStarted = true;
      const execution = this.parsedFiles.withQuery(grammarId, queryString, {
        control,
        compile: () => {
          const query = new mod.Query(entry.language, queryString);
          timer.mark("query-compilation");
          phase = "query-execution";
          return query;
        },
        execute: (query, observation) => {
          cache = observation;
          if (observation.state === "hit") {
            timer.mark("query-cache");
            phase = "query-execution";
          }
          const matches = query.matches(tree.rootNode, {
            progressCallback: () => isStructuralRequestInterrupted(control),
          });
          throwIfStructuralRequestInterrupted(control);
          return collectQueryCaptures(matches, source);
        },
      });
      finishStructuralTiming(timer, {
        operation: "query",
        grammar: grammarId,
        outcome: "completed",
        captureCount: execution.data.length,
        cache: execution.cache,
        finalPhase: "query-execution",
      });
      return { kind: "success", data: execution.data };
    } catch (err: unknown) {
      if (isStructuralRequestInterruption(err, control)) {
        finishStructuralTiming(timer, {
          operation: "query",
          grammar: grammarId,
          outcome: control?.signal?.aborted ? "cancelled" : "timeout",
          captureCount: 0,
          cache,
          finalPhase: phase,
        });
        throw err;
      }
      const validationError = compilationStarted && phase === "query-compilation";
      finishStructuralTiming(timer, {
        operation: "query",
        grammar: grammarId,
        outcome: validationError ? "validation-error" : "runtime-error",
        captureCount: 0,
        cache,
        finalPhase: phase,
      });
      return validationError
        ? { kind: "validation-error", message: `Invalid query: ${formatRuntimeError(err)}` }
        : { kind: "runtime-error", message: formatRuntimeError(err, "Query execution failed") };
    }
  }

  /** Get the grammar ID for a file, or undefined if unsupported. */
  getGrammarId(filePath: string): GrammarId | undefined {
    return detectGrammar(filePath);
  }

  /** Resolve a file path from cwd. */
  resolvePath(filePath: string): string {
    return resolveToolPath(this.cwd, filePath);
  }

  /** Dispose all held tree, query, and parser resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.parsedFiles.dispose();
    for (const [, entry] of this.parsers) {
      deleteWasmResource(entry.parser);
    }
    this.parsers.clear();
    this.parserPromises.clear();
    this.parserModule = undefined;
    this.initPromise = undefined;
    this.initializing = false;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Tree-sitter runtime has been disposed");
    }
  }
}

/** Package-internal query execution for consumers that already own a parsed tree. */
export function queryParsedFile(
  runtime: TreeSitterRuntime,
  input: ParsedQueryInput,
): Promise<TreeSitterResult<QueryCapture[]>> {
  return runtime[QUERY_PARSED_FILE](input);
}

function deleteWasmResource(resource: { delete(): void }): void {
  try {
    resource.delete();
  } catch {
    // Continue cleanup so one failed release does not retain other resources.
  }
}
