// Tree-sitter extension entry point — registers the `tree_sitter` tool with pi.

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
  formatNonSuccess,
  formatOutlineItemsCapped,
  MAX_ITEMS,
  truncate,
  truncatedNotice,
  truncateText,
  validationError,
} from "./formatting.ts";
import { collectOutline } from "./outline.ts";
import { TreeSitterRuntime } from "./runtime.ts";
import { extractExports, extractImports, lookupNodeAt } from "./structure.ts";

const TreeSitterActionEnum = StringEnum([
  "outline",
  "imports",
  "exports",
  "node_at",
  "query",
] as const);

const toolDescription = `Tree-sitter tool — provides structural AST analysis for supported files.

Actions:
- outline: Extract structural declarations (functions, classes, interfaces, etc.)
- imports: List import statements with module specifiers
- exports: List export declarations, re-exports, and export assignments with names and kinds
- node_at: Find the syntax node at a position. Params: file, line, character
- query: Run a Tree-sitter query. Params: file, query

Coordinates are 1-based (line, character), compatible with the lsp tool convention.
Character is a UTF-16 code-unit column.
Relative file paths resolve from the session working directory.

Supported extensions: .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, .cjs`;

const promptGuidelines = [
  "Use tree_sitter for structural syntax-tree analysis: extracting declarations, imports, exports, node-at-position lookup, and custom queries.",
  "Prefer tree_sitter when you need AST node types, exact source ranges, or parser-level structure that semantic language-server tooling does not expose.",
  "tree_sitter is a standalone structural analysis tool; use semantic language-server features separately when they are available for hover, definitions, references, or diagnostics.",
];

const promptSnippet = `Use the tree_sitter tool for structural code analysis — outline, imports, exports, node-at-position lookup, and custom queries.`;

export default function treeSitterExtension(pi: ExtensionAPI) {
  let runtime: TreeSitterRuntime | undefined;

  pi.on("session_start", (_event, ctx) => {
    runtime?.dispose();
    runtime = new TreeSitterRuntime(ctx.cwd);
  });

  pi.on("session_shutdown", () => {
    runtime?.dispose();
    runtime = undefined;
  });

  pi.registerTool({
    name: "tree_sitter",
    label: "Tree-sitter",
    description: toolDescription,
    promptGuidelines,
    promptSnippet,
    parameters: Type.Object({
      action: TreeSitterActionEnum,
      file: Type.Optional(Type.String({ description: "File path (relative or absolute)" })),
      line: Type.Optional(Type.Number({ description: "1-based line number" })),
      character: Type.Optional(Type.Number({ description: "1-based column number (UTF-16)" })),
      query: Type.Optional(Type.String({ description: "Tree-sitter query string" })),
    }),
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!runtime) {
        return {
          content: [
            { type: "text", text: "Tree-sitter not initialized. Start a new session first." },
          ],
          details: {},
        };
      }

      const text = await executeToolAction(runtime, params);
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });
}

type TreeSitterAction = "outline" | "imports" | "exports" | "node_at" | "query";

type ToolParams = {
  action?: string;
  file?: string;
  line?: number;
  character?: number;
  query?: string;
};

async function executeToolAction(runtime: TreeSitterRuntime, params: ToolParams): Promise<string> {
  if (!params.action) {
    return validationError(
      "`action` is required. Supported: outline, imports, exports, node_at, query.",
    );
  }

  const action = toSupportedAction(params.action);
  if (!action) {
    return validationError(
      `Unknown action: ${params.action}. Supported: outline, imports, exports, node_at, query`,
    );
  }

  if (!params.file) {
    return validationError("`file` is required for all actions.");
  }

  if (action === "outline") return handleOutline(runtime, params.file);
  if (action === "imports") return handleImports(runtime, params.file);
  if (action === "exports") return handleExports(runtime, params.file);
  if (action === "node_at") return handleNodeAt(runtime, params);
  return handleQuery(runtime, params);
}

async function handleOutline(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const parseResult = await runtime.parseFile(file);
  if (parseResult.kind !== "success") return formatNonSuccess(parseResult);

  const { tree, source } = parseResult.data;
  let items: ReturnType<typeof collectOutline>;
  try {
    items = collectOutline(tree.rootNode, source);
  } finally {
    tree.delete();
  }

  if (items.length === 0) return `No structural declarations found in ${file}`;

  const lines = [`## Outline: ${file}`, ""];
  const { omitted } = formatOutlineItemsCapped(items, lines, MAX_ITEMS);
  if (omitted) lines.push("", truncatedNotice(omitted, "outline items"));
  return lines.join("\n");
}

async function handleImports(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const result = await extractImports(runtime, file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: imports } = result;
  if (imports.length === 0) return `No imports found in ${file}`;

  const { included, truncated } = truncate(imports, MAX_ITEMS);
  const lines = [`## Imports: ${file}`, ""];
  for (const imp of included) {
    const r = imp.range;
    lines.push(`- "${imp.moduleSpecifier}" (L${r.startLine}:${r.startCharacter})`);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "imports"));
  return lines.join("\n");
}

async function handleExports(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const result = await extractExports(runtime, file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: exports } = result;
  if (exports.length === 0) return `No exports found in ${file}`;

  const { included, truncated } = truncate(exports, MAX_ITEMS);
  const lines = [`## Exports: ${file}`, ""];
  for (const exp of included) {
    const r = exp.range;
    const from = exp.moduleSpecifier ? ` from "${exp.moduleSpecifier}"` : "";
    lines.push(`- ${exp.kind}: ${exp.name}${from} (L${r.startLine}:${r.startCharacter})`);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "exports"));
  return lines.join("\n");
}

async function handleNodeAt(runtime: TreeSitterRuntime, params: ToolParams): Promise<string> {
  if (!Number.isInteger(params.line) || (params.line as number) < 1) {
    return validationError("`line` must be a positive 1-based integer for node_at action.");
  }
  if (!Number.isInteger(params.character) || (params.character as number) < 1) {
    return validationError("`character` must be a positive 1-based integer for node_at action.");
  }

  const file = params.file;
  const line = params.line as number;
  const character = params.character as number;
  const result = await lookupNodeAt(runtime, file as string, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data } = result;
  const lines = [
    `## Node at ${file}:${line}:${character}`,
    "",
    `**Type:** ${data.type}`,
    `**Range:** L${data.range.startLine}:${data.range.startCharacter} — L${data.range.endLine}:${data.range.endCharacter}`,
    `**Text:** ${truncateText(data.text, 200)}`,
  ];

  if (data.ancestry.length > 0) {
    lines.push("", "**Ancestry:**");
    const { included, truncated } = truncate(data.ancestry, MAX_ITEMS);
    for (const ancestor of included) {
      lines.push(
        `- ${ancestor.type} (L${ancestor.range.startLine}:${ancestor.range.startCharacter}-L${ancestor.range.endLine}:${ancestor.range.endCharacter})`,
      );
    }
    if (truncated) lines.push("", truncatedNotice(truncated, "ancestry entries"));
  }

  return lines.join("\n");
}

async function handleQuery(runtime: TreeSitterRuntime, params: ToolParams): Promise<string> {
  if (!params.query || params.query.trim().length === 0) {
    return validationError("`query` is required and must be non-empty.");
  }

  const file = params.file as string;
  const result = await runtime.queryFile(file, params.query);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: captures } = result;
  if (captures.length === 0) return `No matches for query in ${file}`;

  const { included, truncated } = truncate(captures, MAX_ITEMS);
  const lines = [`## Query results: ${file}`, ""];
  for (const capture of included) {
    const r = capture.range;
    lines.push(
      `- ${capture.name}: ${capture.nodeType} (L${r.startLine}:${r.startCharacter}-L${r.endLine}:${r.endCharacter})`,
    );
    lines.push(`  \`${truncateText(capture.text, 120)}\``);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "captures"));
  return lines.join("\n");
}

function toSupportedAction(action: string): TreeSitterAction | undefined {
  if (["outline", "imports", "exports", "node_at", "query"].includes(action)) {
    return action as TreeSitterAction;
  }
  return undefined;
}
