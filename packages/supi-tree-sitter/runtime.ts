// Tree-sitter runtime — parser management, parse, and query services.

import * as fs from "node:fs";
import * as path from "node:path";
// biome-ignore lint/correctness/noUnresolvedImports: web-tree-sitter exports types via declare module
import type { Language, Parser, Tree } from "web-tree-sitter";
import { nodeToRange } from "./coordinates.ts";
import { detectGrammar, resolveGrammarWasmPath } from "./language.ts";
import type { GrammarId, QueryCapture, TreeSitterResult } from "./types.ts";

interface ParserEntry {
  parser: Parser;
  language: Language;
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
  private parserPromises = new Map<GrammarId, Promise<ParserEntry>>();
  private initPromise: Promise<typeof import("web-tree-sitter")> | undefined;
  private initializing = false;
  private disposed = false;

  /** Create a runtime that resolves relative file paths from `cwd`. */
  constructor(private cwd: string) {}

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
      parser.delete();
      throw err;
    }

    if (this.disposed) {
      parser.delete();
      throw new Error("Tree-sitter runtime has been disposed");
    }

    const entry = { parser, language };
    this.parsers.set(grammarId, entry);
    return entry;
  }

  /** Read and parse a file. Returns structured result. */
  async parseFile(filePath: string): Promise<
    TreeSitterResult<{
      tree: Tree;
      source: string;
      resolvedPath: string;
      grammarId: GrammarId;
    }>
  > {
    const resolvedPath = path.resolve(this.cwd, filePath);

    // Check language support first
    const grammarId = detectGrammar(filePath);
    if (!grammarId) {
      return {
        kind: "unsupported-language",
        file: filePath,
        message: `No Tree-sitter grammar configured for ${path.extname(filePath) || "this file type"}`,
      };
    }

    // Read the file
    let source: string;
    try {
      source = fs.readFileSync(resolvedPath, "utf-8");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "File could not be read";
      return {
        kind: "file-access-error",
        file: filePath,
        message,
      };
    }

    try {
      const entry = await this.ensureGrammarParser(grammarId);
      const tree = entry.parser.parse(source);
      return {
        kind: "success",
        data: { tree: tree as Tree, source, resolvedPath, grammarId },
      };
    } catch (err: unknown) {
      return { kind: "runtime-error", message: formatError(err, "Parser initialization failed") };
    }
  }

  /** Execute a Tree-sitter query against a file. */
  async queryFile(
    filePath: string,
    queryString: string,
  ): Promise<TreeSitterResult<QueryCapture[]>> {
    if (!queryString || queryString.trim().length === 0) {
      return { kind: "validation-error", message: "query is required and must be non-empty" };
    }

    const parseResult = await this.parseFile(filePath);
    if (parseResult.kind !== "success") return parseResult;

    const { tree, source } = parseResult.data;

    try {
      const entry = await this.ensureGrammarParser(parseResult.data.grammarId);
      const mod = await this.ensureParserInit();
      let query: InstanceType<typeof mod.Query>;

      try {
        query = new mod.Query(entry.language, queryString);
      } catch (err: unknown) {
        return { kind: "validation-error", message: `Invalid query: ${formatError(err)}` };
      }

      try {
        const matches = query.matches(tree.rootNode);
        const captures: QueryCapture[] = [];
        for (const match of matches) {
          for (const { name, node } of match.captures) {
            captures.push({
              name,
              nodeType: node.type,
              range: nodeToRange(node, source),
              text: node.text,
            });
          }
        }
        return { kind: "success", data: captures };
      } finally {
        query.delete();
      }
    } catch (err: unknown) {
      return { kind: "runtime-error", message: formatError(err, "Query execution failed") };
    } finally {
      tree.delete();
    }
  }

  /** Get the grammar ID for a file, or undefined if unsupported. */
  getGrammarId(filePath: string): GrammarId | undefined {
    return detectGrammar(filePath);
  }

  /** Resolve a file path from cwd. */
  resolvePath(filePath: string): string {
    return path.resolve(this.cwd, filePath);
  }

  /** Dispose all held parser resources. */
  dispose(): void {
    this.disposed = true;
    for (const [, entry] of this.parsers) {
      entry.parser.delete();
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

/** Format errors with their cause chain's first message for user-facing tool output. */
function formatError(err: unknown, fallback = "Operation failed"): string {
  if (!(err instanceof Error)) return String(err || fallback);
  if (err.cause instanceof Error) return `${err.message}: ${err.cause.message}`;
  return err.message || fallback;
}
