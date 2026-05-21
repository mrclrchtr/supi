// Tree-sitter extension entry point — registers the `tree_sitter` tool with pi.

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { detectGrammar, isJsTsGrammar } from "./language.ts";
import { TreeSitterRuntime } from "./session/runtime.ts";
import {
  clearSessionTreeSitterService,
  setSessionTreeSitterService,
} from "./session/service-registry.ts";
import { createTreeSitterService } from "./session/session.ts";
import {
  formatTreeSitterActionList,
  getTreeSitterActionSpec,
  isTreeSitterAction,
  TREE_SITTER_ACTION_NAMES,
  type TreeSitterAction,
} from "./tool/action-specs.ts";
import {
  formatNonSuccess,
  formatOutlineItemsCapped,
  MAX_ITEMS,
  truncate,
  truncatedNotice,
  truncateText,
  validationError,
} from "./tool/formatting.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";
import { collectOutline } from "./tool/outline.ts";
import { extractExports, extractImports, lookupCalleesAt, lookupNodeAt } from "./tool/structure.ts";

const TreeSitterActionEnum = StringEnum(TREE_SITTER_ACTION_NAMES);

export default function treeSitterExtension(pi: ExtensionAPI) {
  let runtime: TreeSitterRuntime | undefined;
  let activeCwd: string | null = null;

  pi.on("session_start", (_event, ctx) => {
    if (runtime && activeCwd) {
      clearSessionTreeSitterService(activeCwd);
      runtime.dispose();
    }

    activeCwd = ctx.cwd;
    runtime = new TreeSitterRuntime(ctx.cwd);
    setSessionTreeSitterService(ctx.cwd, createTreeSitterService(runtime));
  });

  pi.on("session_shutdown", () => {
    if (activeCwd) {
      clearSessionTreeSitterService(activeCwd);
    }
    runtime?.dispose();
    runtime = undefined;
    activeCwd = null;
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

type ToolParams = {
  action?: string;
  file?: string;
  line?: number;
  character?: number;
  query?: string;
};

interface ValidatedToolParams {
  action: TreeSitterAction;
  file: string;
  line?: number;
  character?: number;
  query?: string;
}

const SUPPORTED_ACTIONS_TEXT = formatTreeSitterActionList();

const ACTION_HANDLERS: Record<
  TreeSitterAction,
  (runtime: TreeSitterRuntime, params: ValidatedToolParams) => Promise<string>
> = {
  outline: (runtime, params) => handleOutline(runtime, params.file),
  imports: (runtime, params) => handleImports(runtime, params.file),
  exports: (runtime, params) => handleExports(runtime, params.file),
  node_at: (runtime, params) =>
    handleNodeAt(runtime, params.file, params.line as number, params.character as number),
  query: (runtime, params) => handleQuery(runtime, params.file, params.query as string),
  callees: (runtime, params) =>
    handleCallees(runtime, params.file, params.line as number, params.character as number),
};

async function executeToolAction(runtime: TreeSitterRuntime, params: ToolParams): Promise<string> {
  const validated = validateToolParams(params);
  if (typeof validated === "string") {
    return validated;
  }

  return ACTION_HANDLERS[validated.action](runtime, validated);
}

function validateToolParams(params: ToolParams): ValidatedToolParams | string {
  if (!params.action) {
    return validationError(`\`action\` is required. Supported: ${SUPPORTED_ACTIONS_TEXT}.`);
  }

  if (!isTreeSitterAction(params.action)) {
    return validationError(
      `Unknown action: ${params.action}. Supported: ${SUPPORTED_ACTIONS_TEXT}`,
    );
  }

  if (!params.file) {
    return validationError("`file` is required for all actions.");
  }

  const spec = getTreeSitterActionSpec(params.action);
  if (spec.requiresPosition) {
    const lineError = validatePositiveInteger("line", params.line, params.action);
    if (lineError) return lineError;

    const characterError = validatePositiveInteger("character", params.character, params.action);
    if (characterError) return characterError;
  }

  if (spec.requiresQuery && (!params.query || params.query.trim().length === 0)) {
    return validationError("`query` is required and must be non-empty.");
  }

  return {
    action: params.action,
    file: params.file,
    line: params.line,
    character: params.character,
    query: params.query,
  };
}

function validatePositiveInteger(
  field: "line" | "character",
  value: number | undefined,
  action: TreeSitterAction,
): string | null {
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    return validationError(`\`${field}\` must be a positive 1-based integer for ${action} action.`);
  }
  return null;
}

async function handleOutline(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const parseResult = await runtime.parseFile(file);
  if (parseResult.kind !== "success") return formatNonSuccess(parseResult);
  if (!isJsTsGrammar(parseResult.data.grammarId)) {
    return `Unsupported language: outline is only supported for JavaScript and TypeScript files`;
  }

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
  const grammarId = detectGrammar(file);
  if (grammarId && !isJsTsGrammar(grammarId)) {
    return `Unsupported language: imports is only supported for JavaScript and TypeScript files`;
  }
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
  const grammarId = detectGrammar(file);
  if (grammarId && !isJsTsGrammar(grammarId)) {
    return `Unsupported language: exports is only supported for JavaScript and TypeScript files`;
  }
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

async function handleNodeAt(
  runtime: TreeSitterRuntime,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await lookupNodeAt(runtime, file, line, character);
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

async function handleQuery(
  runtime: TreeSitterRuntime,
  file: string,
  query: string,
): Promise<string> {
  const result = await runtime.queryFile(file, query);
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

async function handleCallees(
  runtime: TreeSitterRuntime,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await lookupCalleesAt(runtime, file, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { enclosingScope, callees } = result.data;
  if (callees.length === 0) {
    return `No outgoing calls found in \`${enclosingScope.name}\` at ${file}:${line}:${character}`;
  }

  const lines: string[] = [];
  lines.push(`## Callees: ${file}:${line}:${character}`);
  lines.push("");
  lines.push(
    `**${callees.length} outgoing call${callees.length > 1 ? "s" : ""}** from \`${enclosingScope.name}\` at L${enclosingScope.range.startLine}-L${enclosingScope.range.endLine}`,
  );
  lines.push("");

  for (const c of callees.slice(0, MAX_ITEMS)) {
    lines.push(`- \`${c.name}\` (L${c.range.startLine})`);
  }
  if (callees.length > MAX_ITEMS) {
    lines.push("", truncatedNotice(callees.length - MAX_ITEMS, "callees"));
  }

  return lines.join("\n");
}
