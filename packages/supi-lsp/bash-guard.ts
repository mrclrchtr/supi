import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as TreeSitter from "web-tree-sitter";
import { directoryContainsSupportedSource } from "./bash-guard-directory.ts";
import type { LspManager } from "./manager.ts";

const SEMANTIC_PROMPT_PATTERNS = [
  /\bdefinition\b/i,
  /\bfind(?: all)? references?\b/i,
  /\breferences?\b/i,
  /\busages?\b/i,
  /\bsymbols?\b/i,
  /\bhover\b/i,
  /\brename\b/i,
  /\bcode actions?\b/i,
  /\bdiagnostics?\b/i,
  /\btype errors?\b/i,
  /\bwarning\b/i,
];

const TEXT_SEARCH_COMMAND_PATTERNS = [
  /\brg\b/,
  /\bripgrep\b/,
  /\bgrep\b/,
  /\bgit\s+grep\b/,
  /\back\b/,
  /\bag\b/,
];

const SEARCH_TOOLS = new Set(["rg", "ripgrep", "grep", "ack", "ag"]);

const FLAG_WITH_VALUE = new Set([
  "-e",
  "--regexp",
  "--regex",
  "-f",
  "--file",
  "-g",
  "--glob",
  "--iglob",
  "--type-add",
  "--sort",
  "-C",
  "-m",
  "--max-count",
]);

const FLAG_ALIASES: Record<string, string> = {
  "--exclude": "-g",
  "--include": "-g",
};

const SUPPORTED_LITERAL_NODE_TYPES = new Set(["word", "raw_string", "string"]);
const UNSUPPORTED = Symbol("unsupported-shell-construct");

const require = createRequire(import.meta.url);
const TREE_SITTER_BASH_PACKAGE_PATH = require.resolve("tree-sitter-bash/package.json");
const BASH_WASM_PATH = path.join(
  path.dirname(TREE_SITTER_BASH_PACKAGE_PATH),
  "tree-sitter-bash.wasm",
);

type SyntaxNode = TreeSitter.Node;
const { Language, Parser } = TreeSitter;

let bashParser: TreeSitter.Parser | null = null;
let bashParserInitPromise: Promise<void> | null = null;

interface ResolvedSearchTarget {
  raw: string;
  resolvedPath: string;
  kind: "file" | "directory" | "unknown";
}

interface ParsedSearchInvocation {
  targets: ResolvedSearchTarget[];
}

interface EvaluationState {
  cwd: string;
}

type EvaluationResult = ParsedSearchInvocation | null | typeof UNSUPPORTED;

export async function initBashParser(): Promise<void> {
  if (bashParser) return;
  if (bashParserInitPromise !== null) return bashParserInitPromise;

  bashParserInitPromise = (async () => {
    try {
      await Parser.init();
      const language = await Language.load(BASH_WASM_PATH);
      const parser = new Parser();
      parser.setLanguage(language);
      bashParser = parser;
    } catch (error) {
      bashParserInitPromise = null;
      process.stderr.write(
        `[supi-lsp] Failed to initialize bash parser for LSP nudges; future sessions will retry: ${String(error)}\n`,
      );
    }
  })();

  return bashParserInitPromise;
}

/**
 * Parse common text-search command invocations to extract file/directory path
 * arguments. Only commands with supported shell structure are interpreted.
 * Returns an empty array when no targets can be extracted.
 */
export function extractSearchTargets(command: string): string[] {
  return parseSearchInvocation(command)?.targets.map((target) => target.raw) ?? [];
}

/**
 * Returns a soft nudge message when the agent runs a text-search command
 * targeting LSP-supported files with a semantically motivated prompt.
 * Returns null when no nudge is appropriate (unsupported shell structure,
 * unsupported file types, non-semantic prompt, or no extractable targets).
 */
export function shouldSuggestLsp(
  command: string,
  prompt: string,
  manager: LspManager,
): string | null {
  if (!isSemanticPrompt(prompt) || !isTextSearchCommand(command)) return null;

  const invocation = parseSearchInvocation(command);
  if (!invocation || invocation.targets.length === 0) return null;

  const hasSupportedTarget = invocation.targets.some((target) =>
    isSupportedTarget(target, manager),
  );
  if (!hasSupportedTarget) return null;

  const visibleTargets = invocation.targets
    .slice(0, 2)
    .map((target) => target.raw)
    .join(", ");
  const targetText = visibleTargets ? ` in ${visibleTargets}` : "";

  return `💡 LSP is active for these files${targetText} — consider the lsp tool for semantic queries.`;
}

export function isSemanticPrompt(prompt: string): boolean {
  return SEMANTIC_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function isTextSearchCommand(command: string): boolean {
  return TEXT_SEARCH_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function parseSearchInvocation(command: string): ParsedSearchInvocation | null {
  if (!bashParser) return null;

  const tree = bashParser.parse(command);
  if (!tree || tree.rootNode.hasError) return null;

  const state: EvaluationState = { cwd: process.cwd() };
  const evaluation = evaluateNode(tree.rootNode, state);
  return evaluation === UNSUPPORTED ? null : evaluation;
}

function evaluateNode(node: SyntaxNode, state: EvaluationState): EvaluationResult {
  switch (node.type) {
    case "program":
      return evaluateProgram(node, state);
    case "list":
      return evaluateList(node, state);
    case "command":
      return evaluateCommand(node, state);
    case "pipeline":
    case "subshell":
      return UNSUPPORTED;
    default:
      return UNSUPPORTED;
  }
}

function evaluateProgram(node: SyntaxNode, state: EvaluationState): EvaluationResult {
  for (const child of node.children) {
    if (!child.isNamed) {
      if (child.type !== ";") return UNSUPPORTED;
      continue;
    }

    const result = evaluateNode(child, state);
    if (result === UNSUPPORTED) return UNSUPPORTED;
    if (result) return result;
  }

  return null;
}

function evaluateList(node: SyntaxNode, state: EvaluationState): EvaluationResult {
  const operator = node.children.find((child) => !child.isNamed)?.type;
  if (operator !== "&&") return UNSUPPORTED;

  const [left, right] = node.namedChildren;
  if (!left || !right) return UNSUPPORTED;

  const leftResult = evaluateNode(left, state);
  if (leftResult === UNSUPPORTED) return UNSUPPORTED;
  if (leftResult) return leftResult;

  return evaluateNode(right, state);
}

function evaluateCommand(node: SyntaxNode, state: EvaluationState): EvaluationResult {
  const nameNode = node.childForFieldName("name");
  const commandName = getCommandName(nameNode);
  if (!commandName) return UNSUPPORTED;

  const argumentNodes = node.namedChildren.filter((child) => child.id !== nameNode?.id);
  const hasPrefixNodes = argumentNodes.some(
    (child) => child.startIndex < (nameNode?.startIndex ?? 0),
  );

  if (commandName === "cd") {
    if (hasPrefixNodes) return UNSUPPORTED;
    const nextCwd = resolveCdTarget(argumentNodes, state.cwd);
    if (!nextCwd) return UNSUPPORTED;
    state.cwd = nextCwd;
    return null;
  }

  const invocation = parseSearchCommand(commandName, argumentNodes, state.cwd, hasPrefixNodes);
  if (invocation === UNSUPPORTED) return UNSUPPORTED;
  if (invocation) return invocation;

  return null;
}

function getCommandName(node: SyntaxNode | null): string | null {
  if (!node || node.type !== "command_name") return null;
  const commandNode = node.firstNamedChild ?? node;
  if (commandNode.type !== "word") return null;
  return commandNode.text;
}

function resolveCdTarget(argumentNodes: SyntaxNode[], cwd: string): string | null {
  if (argumentNodes.length !== 1) return null;
  const target = getLiteralToken(argumentNodes[0]);
  if (!target) return null;
  return path.resolve(cwd, target);
}

function parseSearchCommand(
  commandName: string,
  argumentNodes: SyntaxNode[],
  cwd: string,
  hasPrefixNodes: boolean,
): ParsedSearchInvocation | null | typeof UNSUPPORTED {
  if (!SEARCH_TOOLS.has(commandName) && commandName !== "git") return null;
  if (hasPrefixNodes) return UNSUPPORTED;

  const tokens = argumentNodes.map(getLiteralToken);
  if (tokens.some((token) => token === null)) return UNSUPPORTED;

  let rest = tokens as string[];

  if (commandName === "git") {
    if (rest[0] !== "grep") return null;
    rest = rest.slice(1);
  }

  const rawTargets = extractPathsAfterPattern(rest);
  return {
    targets: rawTargets.map((raw) => resolveSearchTarget(raw, cwd)),
  };
}

function getLiteralToken(node: SyntaxNode): string | null {
  if (!SUPPORTED_LITERAL_NODE_TYPES.has(node.type)) return null;
  let value: string;

  if (node.type === "string") {
    if (node.namedChildCount !== 1) return null;
    const content = node.firstNamedChild;
    if (!content || content.type !== "string_content") return null;
    value = content.text;
  } else {
    if (node.namedChildCount > 0) return null;
    const text = node.text;
    value = node.type === "raw_string" && text.length >= 2 ? text.slice(1, -1) : text;
  }

  return /[$*?~`()]/.test(value) ? null : value;
}

function resolveSearchTarget(raw: string, cwd: string): ResolvedSearchTarget {
  const resolvedPath = path.resolve(cwd, raw);
  return {
    raw,
    resolvedPath,
    kind: getTargetKind(raw, resolvedPath),
  };
}

function getTargetKind(raw: string, resolvedPath: string): "file" | "directory" | "unknown" {
  if (existsSync(resolvedPath)) {
    try {
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) return "directory";
      if (stats.isFile()) return "file";
    } catch {}
  }

  if (raw.endsWith("/")) return "directory";
  if (path.extname(raw)) return "file";
  return "unknown";
}

function isSupportedTarget(target: ResolvedSearchTarget, manager: LspManager): boolean {
  if (target.kind === "file") return manager.isSupportedSourceFile(target.resolvedPath);
  if (target.kind === "directory") {
    return directoryContainsSupportedSource(target.resolvedPath, manager);
  }
  return false;
}

function isFlagWithValue(token: string): boolean {
  return FLAG_WITH_VALUE.has(FLAG_ALIASES[token] ?? token);
}

function isLongFlagWithEquals(token: string): boolean {
  return token.startsWith("--") && token.includes("=");
}

function isFlagToken(token: string): boolean {
  return token.startsWith("-");
}

function extractPathsAfterPattern(tokens: string[]): string[] {
  const paths: string[] = [];
  let i = 0;
  let patternSeen = false;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === "--") {
      return tokens.slice(i + 1);
    }

    if (isLongFlagWithEquals(tok)) {
      i++;
      continue;
    }

    if (isFlagWithValue(tok)) {
      i += 2;
      continue;
    }

    if (isFlagToken(tok)) {
      i++;
      continue;
    }

    if (!patternSeen) {
      patternSeen = true;
      i++;
      continue;
    }

    paths.push(tok);
    i++;
  }

  return paths;
}
