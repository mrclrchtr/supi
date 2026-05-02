import type { Theme } from "@mariozechner/pi-coding-agent";
import type { ContextAnalysis } from "./analysis.ts";
import { formatTokens, pluralize } from "./utils.ts";

const GRID_COLS = 20;
const GRID_ROWS = 5;
const GRID_BLOCKS = GRID_COLS * GRID_ROWS;

type CategoryKey =
  | "systemPrompt"
  | "userMessages"
  | "assistantMessages"
  | "toolCalls"
  | "toolResults"
  | "other";

const CATEGORY_ORDER: CategoryKey[] = [
  "systemPrompt",
  "userMessages",
  "assistantMessages",
  "toolCalls",
  "toolResults",
  "other",
];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  systemPrompt: "System prompt",
  userMessages: "User messages",
  assistantMessages: "Assistant messages",
  toolCalls: "Tool calls",
  toolResults: "Tool results",
  other: "Other",
};

const CATEGORY_COLORS: Record<CategoryKey, Parameters<Theme["fg"]>["0"]> = {
  systemPrompt: "accent",
  userMessages: "success",
  assistantMessages: "warning",
  toolCalls: "error",
  toolResults: "dim",
  other: "muted",
};

function pct(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function padLeft(text: string, width: number): string {
  return text.padStart(width, " ");
}

function padRight(text: string, width: number): string {
  return text.padEnd(width, " ");
}

function allocateGridBlocks(segments: number[]): number[] {
  const total = segments.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return segments.map(() => 0);
  }

  const exact = segments.map((value) => (value / total) * GRID_BLOCKS);
  const counts = exact.map((value) => Math.floor(value));
  const remaining = GRID_BLOCKS - counts.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining; i++) {
    counts[byRemainder[i]?.index ?? 0] += 1;
  }

  return counts;
}

function renderGrid(analysis: ContextAnalysis, theme: Theme): string[] {
  const { contextWindow, categories } = analysis;
  if (contextWindow <= 0) {
    return [theme.fg("dim", "No model selected — grid unavailable")];
  }

  const segments = [
    ...CATEGORY_ORDER.map((key) => ({
      color: CATEGORY_COLORS[key],
      tokens: categories[key],
      block: "█",
    })),
    { color: "dim" as Parameters<Theme["fg"]>["0"], tokens: categories.freeSpace, block: "░" },
    {
      color: "warning" as Parameters<Theme["fg"]>["0"],
      tokens: categories.autocompactBuffer,
      block: "░",
    },
  ];

  const counts = allocateGridBlocks(segments.map((segment) => segment.tokens));
  const blocks: string[] = [];
  for (const [index, segment] of segments.entries()) {
    for (let i = 0; i < (counts[index] ?? 0); i++) {
      blocks.push(theme.fg(segment.color, segment.block));
    }
  }

  const gridLines: string[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const start = row * GRID_COLS;
    const line = blocks.slice(start, start + GRID_COLS).join("");
    gridLines.push(line);
  }

  // Model info on the right
  const infoLines = [
    theme.fg("text", analysis.modelName),
    theme.fg("dim", `${formatTokens(contextWindow)} context window`),
    theme.fg(
      "text",
      `${formatTokens(analysis.totalTokens ?? 0)} used (${pct(analysis.totalTokens ?? 0, contextWindow)})`,
    ),
  ];

  if (analysis.approximationNote) {
    infoLines.push(theme.fg("warning", analysis.approximationNote));
  }

  const combined: string[] = [];
  for (let i = 0; i < GRID_ROWS; i++) {
    const left = gridLines[i] ?? "";
    const right = infoLines[i] ?? "";
    combined.push(`${left}  ${right}`);
  }
  // Append any remaining info lines if grid is shorter (shouldn't happen with 5 rows)
  for (let i = GRID_ROWS; i < infoLines.length; i++) {
    combined.push(`${" ".repeat(GRID_COLS + 2)}${infoLines[i]}`);
  }

  return combined;
}

function renderCategoryBreakdown(analysis: ContextAnalysis, theme: Theme): string[] {
  const lines: string[] = [];
  lines.push(theme.fg("accent", "Usage by category"));

  const { contextWindow, categories } = analysis;
  const allCategories: Array<{
    key: CategoryKey | "autocompactBuffer" | "freeSpace";
    label: string;
    color: Parameters<Theme["fg"]>["0"];
    tokens: number;
  }> = [
    ...CATEGORY_ORDER.map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      color: CATEGORY_COLORS[key],
      tokens: categories[key],
    })),
    {
      key: "autocompactBuffer",
      label: "Autocompact buffer",
      color: "warning" as Parameters<Theme["fg"]>["0"],
      tokens: categories.autocompactBuffer,
    },
    {
      key: "freeSpace",
      label: "Free space",
      color: "dim" as Parameters<Theme["fg"]>["0"],
      tokens: categories.freeSpace,
    },
  ];

  for (const cat of allCategories) {
    if (cat.tokens <= 0 && cat.key !== "freeSpace") continue;
    const label = padRight(cat.label, 20);
    const tokens = padLeft(formatTokens(cat.tokens), 8);
    const percentage = padLeft(pct(cat.tokens, contextWindow), 7);
    lines.push(`${theme.fg(cat.color, "●")} ${label} ${tokens} ${percentage}`);
  }

  return lines;
}

function renderContextFilesSection(analysis: ContextAnalysis, theme: Theme): string[] {
  const files = analysis.systemPromptBreakdown.contextFiles;
  if (files.length === 0) return [];

  const lines: string[] = [];
  lines.push("");
  lines.push(theme.fg("accent", "Context Files (system prompt)"));
  for (const f of files) {
    lines.push(`  ${theme.fg("text", f.path)}  ${theme.fg("dim", formatTokens(f.tokens))}`);
  }
  return lines;
}

function renderInjectedFilesSection(analysis: ContextAnalysis, theme: Theme): string[] {
  const files = analysis.injectedFiles;
  if (files.length === 0) return [];

  const lines: string[] = [];
  lines.push("");
  lines.push(theme.fg("accent", "Context Files (injected · supi-claude-md)"));
  for (const f of files) {
    lines.push(
      `  ${theme.fg("text", f.file)}  ${theme.fg("dim", formatTokens(f.tokens))}  ${theme.fg("dim", `turn ${f.turn}`)}`,
    );
  }
  return lines;
}

function renderSkillsSection(analysis: ContextAnalysis, theme: Theme): string[] {
  const lines: string[] = [];
  lines.push("");
  lines.push(theme.fg("accent", `Skills (${analysis.skills.length})`));

  if (analysis.skills.length === 0) {
    lines.push(theme.fg("dim", "  Send a message to see skill details"));
    return lines;
  }

  for (const s of analysis.skills) {
    lines.push(`  ${theme.fg("text", s.name)}  ${theme.fg("dim", formatTokens(s.tokens))}`);
  }
  return lines;
}

function renderGuidelinesAndTools(analysis: ContextAnalysis, theme: Theme): string[] {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `${theme.fg("text", "Guidelines")}  ${theme.fg("dim", formatTokens(analysis.guidelines))}`,
  );
  lines.push(
    `${theme.fg("text", `Tool Definitions (${analysis.toolDefinitions.count} active)`)}  ${theme.fg("dim", formatTokens(analysis.toolDefinitions.tokens))}`,
  );
  return lines;
}

function renderCompactionNote(analysis: ContextAnalysis, theme: Theme): string[] {
  if (!analysis.compaction) return [];
  return [
    "",
    theme.fg(
      "dim",
      `↳ ${pluralize(analysis.compaction.summarizedTurns, "older turn", "older turns")} summarized (compaction)`,
    ),
  ];
}

export function formatContextReport(analysis: ContextAnalysis, theme: Theme): string[] {
  const lines: string[] = [];

  lines.push(theme.fg("accent", "◆ Context Usage"));
  lines.push("");
  lines.push(...renderGrid(analysis, theme));
  lines.push("");
  lines.push(...renderCategoryBreakdown(analysis, theme));
  lines.push(...renderContextFilesSection(analysis, theme));
  lines.push(...renderInjectedFilesSection(analysis, theme));
  lines.push(...renderSkillsSection(analysis, theme));
  lines.push(...renderGuidelinesAndTools(analysis, theme));
  lines.push(...renderCompactionNote(analysis, theme));

  return lines;
}
