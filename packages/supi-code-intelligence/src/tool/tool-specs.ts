import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { CodeIntelResult } from "../types.ts";
import { executeAffectedTool } from "./execute-affected.ts";
import { executeBriefTool } from "./execute-brief.ts";
import { executeMapTool } from "./execute-map.ts";
import { executePatternTool } from "./execute-pattern.ts";
import { executeRelationsTool } from "./execute-relations.ts";

const PathParam = Type.String({ description: "Scope or focus path (package, directory, or file)" });
const FileParam = Type.String({
  description:
    "Anchored target file (use with line/character) or a file-level semantic target where supported",
});
const LineParam = Type.Number({ description: "1-based line number for anchored target" });
const CharacterParam = Type.Number({
  description: "1-based character column (UTF-16) for anchored target",
});
const SymbolParam = Type.String({ description: "Symbol name for discovery-based resolution" });
const PatternParam = Type.String({ description: "Text search pattern" });
const RegexParam = Type.Boolean({ description: "Use regex semantics instead of literal matching" });
const ExportedOnlyParam = Type.Boolean({ description: "Limit discovery to exported symbols" });
const MaxResultsParam = Type.Number({ description: "Maximum results to return" });
const ContextLinesParam = Type.Number({ description: "Context lines around matches" });
const SummaryParam = Type.Boolean({
  description: "Aggregate counts by directory instead of line-level matches",
});
const StructuredPatternKindParam = Type.String({
  description: "Structured pattern kind (`definition` | `export` | `import`)",
});

export const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_brief",
  "code_map",
  "code_relations",
  "code_affected",
  "code_pattern",
] as const;
export type CodeIntelligenceToolName = (typeof CODE_INTELLIGENCE_TOOL_NAMES)[number];

export const CODE_RELATION_KIND_NAMES = ["callers", "callees", "implementations"] as const;
export type CodeRelationsKind = (typeof CODE_RELATION_KIND_NAMES)[number];

const CodeRelationsKindEnum = StringEnum(CODE_RELATION_KIND_NAMES);

const CodeBriefParameters = Type.Object(
  {
    path: Type.Optional(PathParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeMapParameters = Type.Object(
  {
    path: Type.Optional(Type.String({ description: "Project, package, or directory path to map" })),
  },
  { additionalProperties: false },
);

const CodeRelationsParameters = Type.Object(
  {
    kind: CodeRelationsKindEnum,
    path: Type.Optional(PathParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    exportedOnly: Type.Optional(ExportedOnlyParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeAffectedParameters = Type.Object(
  {
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    exportedOnly: Type.Optional(ExportedOnlyParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodePatternParameters = Type.Object(
  {
    path: Type.Optional(PathParam),
    pattern: PatternParam,
    regex: Type.Optional(RegexParam),
    kind: Type.Optional(StructuredPatternKindParam),
    maxResults: Type.Optional(MaxResultsParam),
    contextLines: Type.Optional(ContextLinesParam),
    summary: Type.Optional(SummaryParam),
  },
  { additionalProperties: false },
);

export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
  run: (params: unknown, ctx: { cwd: string }) => Promise<CodeIntelResult> | CodeIntelResult;
}

export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_brief",
    label: "Code Brief",
    description:
      "Code brief tool — interpretive orientation for a project, package, directory, file, or symbol. Use code_brief when you need prioritized context and start-here guidance rather than raw search output.",
    promptSnippet: "code_brief — interpretive orientation and start-here guidance",
    basePromptGuidelines: [
      "Use code_brief for a project, package, directory, file, or symbol overview when you need prioritized context.",
      "Use code_brief before deeper drill-down when you want a start-here recommendation instead of raw inventory output.",
    ],
    parameters: CodeBriefParameters,
    run: (params, ctx) => executeBriefTool(params as Parameters<typeof executeBriefTool>[0], ctx),
  },
  {
    name: "code_map",
    label: "Code Map",
    description:
      "Code map tool — factual inventory for a repo, package, or directory. Use code_map when you want counts, child directories, language mix, and landmark files without interpretive guidance.",
    promptSnippet: "code_map — factual project, package, or directory inventory",
    basePromptGuidelines: [
      "Use code_map for a factual repo, package, or directory map when you need counts, landmark files, and local structure without interpretation.",
      "Use code_map with `path` for any directory path you want to inventory; code_map should stay factual rather than prioritized.",
    ],
    parameters: CodeMapParameters,
    run: (params, ctx) => executeMapTool(params as Parameters<typeof executeMapTool>[0], ctx),
  },
  {
    name: "code_relations",
    label: "Code Relations",
    description:
      'Code relations tool — trace callers, callees, or implementations for a resolved target. Use code_relations with `kind: "callers" | "callees" | "implementations"` when you need semantic or structural relationships rather than broad search.',
    promptSnippet: "code_relations — callers, callees, or implementations for a resolved target",
    basePromptGuidelines: [
      'Use code_relations with `kind: "callers"` to find who invokes a symbol or file-level surface.',
      'Use code_relations with `kind: "callees"` to inspect outgoing calls from a function or method at a known position.',
      'Use code_relations with `kind: "implementations"` to find which concrete types implement a declaration.',
    ],
    parameters: CodeRelationsParameters,
    run: (params, ctx) =>
      executeRelationsTool(params as Parameters<typeof executeRelationsTool>[0], ctx),
  },
  {
    name: "code_affected",
    label: "Code Affected",
    description:
      "Code affected tool — estimate blast radius, downstream impact, and risk for a target. Use code_affected before edits when you need an impact-oriented view rather than a plain relationship list.",
    promptSnippet: "code_affected — blast radius, downstream impact, and risk",
    basePromptGuidelines: [
      "Use code_affected before edits when you need blast radius, downstream impact, and likely follow-up checks.",
      "Use code_affected after you have a concrete file/position or symbol target to estimate change risk.",
    ],
    parameters: CodeAffectedParameters,
    run: (params, ctx) =>
      executeAffectedTool(params as Parameters<typeof executeAffectedTool>[0], ctx),
  },
  {
    name: "code_pattern",
    label: "Code Pattern",
    description:
      "Code pattern tool — explicit literal, regex, or structured search within a bounded scope. Use code_pattern when you intentionally want search behavior rather than semantic or structural relationships.",
    promptSnippet: "code_pattern — explicit literal, regex, or structured search",
    basePromptGuidelines: [
      "Use code_pattern for explicit literal or regex search within a bounded path.",
      'Use code_pattern with `kind: "definition" | "export" | "import"` for structured search instead of plain text matching.',
    ],
    parameters: CodePatternParameters,
    run: (params, ctx) =>
      executePatternTool(params as Parameters<typeof executePatternTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
