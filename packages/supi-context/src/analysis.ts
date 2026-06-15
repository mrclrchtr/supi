// biome-ignore lint/style/noExcessiveLinesPerFile: analysis file is inherently large
import { dirname, resolve } from "node:path";
import {
  type BuildSystemPromptOptions,
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type estimateTokens,
  formatSkillsForPrompt,
  getLatestCompactionEntry,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { getRegisteredContextProviders } from "@mrclrchtr/supi-core/context";

import { deriveOptionsFromSystemPrompt, extractGuidelinesSection } from "./prompt-inference.ts";

type AgentMessage = Parameters<typeof estimateTokens>[0];

export interface CategoryTokens {
  systemPrompt: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  other: number;
}

export interface ContextFileInfo {
  path: string;
  tokens: number;
  lines: number;
  origin: "global" | "project";
}

export interface InjectedFileInfo {
  file: string;
  turn: number;
  tokens: number;
  lines: number;
}

export interface SkillInfo {
  name: string;
  tokens: number;
}

export interface ToolInfo {
  name: string;
  description: string;
  tokens: number;
}

/** Per-tool breakdown of the one-line tool snippet shown in "Available tools". */
export interface ToolSnippetInfo {
  name: string;
  tokens: number;
}

/** Source-attributed guideline info. */
export interface GuidelineSourceInfo {
  source: string; // "default" | tool name | "other"
  tokens: number;
  bulletCount: number;
}

export interface ContextProviderSection {
  id: string;
  label: string;
  data: Record<string, string | number>;
}

export interface ContextAnalysis {
  modelName: string;
  contextWindow: number;
  totalTokens: number | null;
  scaled: boolean;
  approximationNote: string | null;
  full: boolean;
  categories: CategoryTokens & {
    autocompactBuffer: number;
    freeSpace: number;
  };
  systemPromptBreakdown: {
    base: number;
    instructionFiles: ContextFileInfo[];
    contextFiles: ContextFileInfo[];
    skills: SkillInfo[];
    guidelines: number;
    toolSnippets: number;
    toolSnippetDetails: ToolSnippetInfo[];
    guidelineSources: GuidelineSourceInfo[];
    appendText: number;
  };
  injectedFiles: InjectedFileInfo[];
  skills: SkillInfo[];
  guidelines: number;
  guidelineBullets: string[];
  guidelineSources: GuidelineSourceInfo[];
  toolSnippetDetails: ToolSnippetInfo[];
  toolDefinitions: { count: number; tokens: number; tools: ToolInfo[] };
  compaction: { summarizedTurns: number } | null;
  providerSections: ContextProviderSection[];
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateGenericContent(content: unknown): number {
  if (typeof content === "string") {
    return estimateTextTokens(content);
  }
  if (Array.isArray(content)) {
    let chars = 0;
    for (const block of content as Array<{ type?: string; text?: string }>) {
      if (block.type === "text" && block.text) {
        chars += block.text.length;
      }
    }
    return Math.ceil(chars / 4);
  }
  return 0;
}

function estimateUserMessage(msg: Extract<AgentMessage, { role: "user" }>): number {
  const content = msg.content;
  if (typeof content === "string") {
    return estimateTextTokens(content);
  }
  if (Array.isArray(content)) {
    let chars = 0;
    for (const block of content) {
      if (block.type === "text" && block.text) {
        chars += block.text.length;
      }
    }
    return Math.ceil(chars / 4);
  }
  return 0;
}

function estimateAssistantMessage(msg: Extract<AgentMessage, { role: "assistant" }>): {
  text: number;
  toolCalls: number;
} {
  if (!Array.isArray(msg.content)) {
    return { text: 0, toolCalls: 0 };
  }
  let textChars = 0;
  let toolChars = 0;
  for (const block of msg.content) {
    if (block.type === "text") {
      textChars += block.text.length;
    } else if (block.type === "thinking") {
      textChars += block.thinking.length;
    } else if (block.type === "toolCall") {
      toolChars += block.name.length + JSON.stringify(block.arguments).length;
    }
  }
  return { text: Math.ceil(textChars / 4), toolCalls: Math.ceil(toolChars / 4) };
}

function estimateMessageByCategory(msg: AgentMessage): {
  user: number;
  assistantText: number;
  toolCalls: number;
  toolResult: number;
  other: number;
} {
  if (msg.role === "user") {
    return {
      user: estimateUserMessage(msg),
      assistantText: 0,
      toolCalls: 0,
      toolResult: 0,
      other: 0,
    };
  }
  if (msg.role === "assistant") {
    const est = estimateAssistantMessage(msg);
    return { user: 0, assistantText: est.text, toolCalls: est.toolCalls, toolResult: 0, other: 0 };
  }
  if (msg.role === "toolResult") {
    return {
      user: 0,
      assistantText: 0,
      toolCalls: 0,
      toolResult: estimateGenericContent(msg.content),
      other: 0,
    };
  }
  return {
    user: 0,
    assistantText: 0,
    toolCalls: 0,
    toolResult: 0,
    other: estimateGenericContent((msg as unknown as Record<string, unknown>).content),
  };
}

function computeMessageCategories(messages: AgentMessage[]): CategoryTokens {
  const categories: CategoryTokens = {
    systemPrompt: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    other: 0,
  };

  for (const msg of messages) {
    const est = estimateMessageByCategory(msg);
    categories.userMessages += est.user;
    categories.assistantMessages += est.assistantText;
    categories.toolCalls += est.toolCalls;
    categories.toolResults += est.toolResult;
    categories.other += est.other;
  }

  return categories;
}

function applyScaling(
  categories: CategoryTokens,
  actualTokens: number | null,
  rawTotal: number,
  contextUsage:
    | { tokens: number | null; contextWindow: number; percent: number | null }
    | undefined,
): {
  categories: CategoryTokens;
  scaled: boolean;
  approximationNote: string | null;
  totalTokens: number;
} {
  let scaled = false;
  let approximationNote: string | null = null;
  const hasActualTotal = actualTokens !== null && actualTokens > 0;
  const totalTokens = hasActualTotal ? actualTokens : rawTotal;

  if (contextUsage === undefined) {
    approximationNote = "Approximate (no usage data available)";
  } else if (hasActualTotal && rawTotal > 0) {
    const scale = actualTokens / rawTotal;
    categories.systemPrompt = Math.round(categories.systemPrompt * scale);
    categories.userMessages = Math.round(categories.userMessages * scale);
    categories.assistantMessages = Math.round(categories.assistantMessages * scale);
    categories.toolCalls = Math.round(categories.toolCalls * scale);
    categories.toolResults = Math.round(categories.toolResults * scale);
    categories.other = Math.round(categories.other * scale);
    scaled = true;
  } else if (actualTokens === null || actualTokens === 0) {
    approximationNote = "Token count pending — send a message to refresh";
  }

  return { categories, scaled, approximationNote, totalTokens };
}

/**
 * Collect data from registered context providers.
 */
function collectProviderData(): ContextProviderSection[] {
  const sections: ContextProviderSection[] = [];
  for (const provider of getRegisteredContextProviders()) {
    const data = provider.getData();
    if (data) {
      sections.push({ id: provider.id, label: provider.label, data });
    }
  }
  return sections;
}

const INSTRUCTION_FILE_PATTERN = /^(AGENTS|CLAUDE|\.claude\.local)\.md$/i;

function isInstructionFile(path: string): boolean {
  const basename = path.replace(/\\/g, "/").split("/").pop() ?? "";
  return INSTRUCTION_FILE_PATTERN.test(basename);
}

function determineOrigin(filePath: string, cwd: string): "global" | "project" {
  const resolvedPath = resolve(cwd, filePath);
  const fileDir = dirname(resolvedPath);
  let current = cwd;
  const root = resolve("/");
  while (true) {
    if (fileDir === current) return "project";
    if (current === root) break;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return "global";
}

function computeContextFiles(
  promptOptions: BuildSystemPromptOptions | undefined,
  cwd: string,
): { contextFiles: ContextFileInfo[]; instructionFiles: ContextFileInfo[] } {
  const contextFiles: ContextFileInfo[] = [];
  const instructionFiles: ContextFileInfo[] = [];
  if (promptOptions?.contextFiles) {
    for (const cf of promptOptions.contextFiles) {
      const info: ContextFileInfo = {
        path: cf.path,
        tokens: estimateTextTokens(cf.content),
        lines: cf.content.split("\n").length,
        origin: determineOrigin(cf.path, cwd),
      };
      if (isInstructionFile(cf.path)) {
        instructionFiles.push(info);
      } else {
        contextFiles.push(info);
      }
    }
  }
  return { contextFiles, instructionFiles };
}

function computeSkills(promptOptions: BuildSystemPromptOptions | undefined): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (promptOptions?.skills) {
    for (const skill of promptOptions.skills) {
      const skillText = formatSkillsForPrompt([skill]);
      skills.push({ name: skill.name, tokens: estimateTextTokens(skillText) });
    }
  }
  return skills;
}

function extractGuidelineBullets(guidelinesText: string | null): string[] {
  if (!guidelinesText) return [];
  return guidelinesText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

/**
 * Known texts of PI built-in default guidelines.
 * These are generated by buildSystemPrompt() in the system prompt builder.
 */
const DEFAULT_GUIDELINE_TEXTS = new Set([
  "Use bash for file operations like ls, rg, find",
  "Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
  "Be concise in your responses",
  "Show file paths clearly when working with files",
]);

/**
 * Known promptGuidelines from PI's built-in tools.
 * These are hardcoded in the tool definition modules (read, write, edit).
 */
const BUILTIN_TOOL_GUIDELINES: Record<string, string[]> = {
  read: ["Use read to examine files instead of cat or sed."],
  write: ["Use write only for new files or complete rewrites."],
  edit: [
    "Use edit for precise changes (edits[].oldText must match exactly)",
    "When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls",
    "Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.",
    "Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.",
  ],
};

/**
 * Build a reverse map from guideline text → tool name so we can look up
 * which built-in tool (if any) contributed each guideline bullet.
 */
function buildGuidelineToToolMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tool, guidelines] of Object.entries(BUILTIN_TOOL_GUIDELINES)) {
    for (const guideline of guidelines) {
      map.set(guideline, tool);
    }
  }
  return map;
}

const GUIDELINE_TO_TOOL = buildGuidelineToToolMap();

/**
 * Given guideline bullets extracted from the system prompt, classify each bullet
 * by source and compute per-source token counts.
 */
function classifyGuidelines(bullets: string[], _activeToolNames: string[]): GuidelineSourceInfo[] {
  const sources = new Map<string, { chars: number; count: number }>();

  for (const bullet of bullets) {
    let source: string;
    if (DEFAULT_GUIDELINE_TEXTS.has(bullet)) {
      source = "default";
    } else {
      const toolName = GUIDELINE_TO_TOOL.get(bullet);
      source = toolName ?? "other";
    }

    const entry = sources.get(source) ?? { chars: 0, count: 0 };
    entry.chars += bullet.length;
    entry.count += 1;
    sources.set(source, entry);
  }

  return Array.from(sources.entries())
    .map(([source, { chars, count }]) => ({
      source,
      tokens: Math.ceil(chars / 4),
      bulletCount: count,
    }))
    .sort((a, b) => {
      // Default first, then tool sources (alphabetical), then "other" last
      if (a.source === "default") return -1;
      if (b.source === "default") return 1;
      if (a.source === "other") return 1;
      if (b.source === "other") return -1;
      return a.source.localeCompare(b.source);
    });
}

/**
 * Build per-tool snippet breakdown from the toolSnippets record.
 */
function buildToolSnippetDetails(
  toolSnippets: Record<string, string> | undefined,
): ToolSnippetInfo[] {
  if (!toolSnippets) return [];

  return Object.entries(toolSnippets)
    .map(([name, snippet]) => ({
      name,
      tokens: estimateTextTokens(snippet),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function computeSystemPromptBreakdown(
  promptOptions: BuildSystemPromptOptions | undefined,
  systemPromptText: string,
  systemPromptTokens: number,
  cwd: string,
): ContextAnalysis["systemPromptBreakdown"] {
  const { contextFiles, instructionFiles } = computeContextFiles(promptOptions, cwd);
  const skills = computeSkills(promptOptions);

  const skillsTotal = skills.reduce((s, c) => s + c.tokens, 0);
  const inferredGuidelines = extractGuidelinesSection(systemPromptText);
  const guidelines = inferredGuidelines
    ? estimateTextTokens(inferredGuidelines)
    : promptOptions?.promptGuidelines
      ? estimateTextTokens(promptOptions.promptGuidelines.join("\n"))
      : 0;
  const toolSnippetsTotal = promptOptions?.toolSnippets
    ? estimateTextTokens(Object.values(promptOptions.toolSnippets).join("\n"))
    : 0;
  const toolSnippetDetails = buildToolSnippetDetails(promptOptions?.toolSnippets);
  const guidelineBullets = extractGuidelineBullets(inferredGuidelines);
  const activeToolNames = promptOptions?.selectedTools ?? [];
  const guidelineSources = classifyGuidelines(guidelineBullets, activeToolNames);
  const appendText = promptOptions?.appendSystemPrompt
    ? estimateTextTokens(promptOptions.appendSystemPrompt)
    : 0;
  const customTokens = promptOptions?.customPrompt
    ? estimateTextTokens(promptOptions.customPrompt)
    : 0;

  const knownSubtotal =
    contextFiles.reduce((s, c) => s + c.tokens, 0) +
    instructionFiles.reduce((s, c) => s + c.tokens, 0) +
    skillsTotal +
    guidelines +
    toolSnippetsTotal +
    appendText +
    customTokens;

  const base = Math.max(0, systemPromptTokens - knownSubtotal);

  return {
    base,
    instructionFiles,
    contextFiles,
    skills,
    guidelines,
    toolSnippets: toolSnippetsTotal,
    toolSnippetDetails,
    guidelineSources,
    appendText,
  };
}

function computeToolDefinitions(pi: ExtensionAPI): {
  count: number;
  tokens: number;
  tools: ToolInfo[];
} {
  const activeToolNames = new Set(pi.getActiveTools());
  const allTools = pi.getAllTools();
  const activeTools = allTools.filter((t) => activeToolNames.has(t.name));
  const tools = activeTools.map((t) => ({
    name: t.name,
    description: t.description,
    tokens: estimateTextTokens(
      JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters }),
    ),
  }));
  return {
    count: activeTools.length,
    tokens: tools.reduce((sum, t) => sum + t.tokens, 0),
    tools,
  };
}

function detectCompaction(
  branch: ReturnType<ExtensionCommandContext["sessionManager"]["getBranch"]>,
): {
  summarizedTurns: number;
} | null {
  const compactionEntry = getLatestCompactionEntry(branch);
  if (!compactionEntry) return null;

  const index = branch.findIndex((e) => e.id === compactionEntry.id);
  const messagesBefore = branch
    .slice(0, Math.max(0, index))
    .filter((e) => e.type === "message").length;
  const summarizedTurns = Math.floor(messagesBefore / 2);
  return { summarizedTurns };
}

export function extractInjectedContextFiles(messages: AgentMessage[]): InjectedFileInfo[] {
  const regex =
    /<extension-context source="supi-claude-md" file="([^"]+)" turn="(\d+)">([\s\S]*?)<\/extension-context>/g;
  const seen = new Map<string, InjectedFileInfo>();

  for (const msg of messages) {
    if (msg.role !== "toolResult") continue;
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
            .join("");
    let match = regex.exec(content);
    while (match !== null) {
      const file = match[1];
      const turn = Number.parseInt(match[2], 10);
      const innerContent = match[3];
      const key = `${file}::${turn}`;
      if (!seen.has(key)) {
        seen.set(key, {
          file,
          turn,
          tokens: estimateTextTokens(innerContent),
          lines: innerContent.split("\n").length,
        });
      }
      match = regex.exec(content);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.turn - b.turn || a.file.localeCompare(b.file));
}

export function analyzeContext(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  cachedOptions: BuildSystemPromptOptions | undefined,
  full = false,
): ContextAnalysis {
  const branch = ctx.sessionManager.getBranch();
  const apiView = buildSessionContext(branch);
  const contextUsage = ctx.getContextUsage();
  const contextWindow = contextUsage?.contextWindow ?? 0;
  const actualTokens = contextUsage?.tokens ?? null;

  const systemPromptText = ctx.getSystemPrompt();
  const categories = computeMessageCategories(apiView.messages);
  categories.systemPrompt = estimateTextTokens(systemPromptText);

  const rawTotal =
    categories.systemPrompt +
    categories.userMessages +
    categories.assistantMessages +
    categories.toolCalls +
    categories.toolResults +
    categories.other;

  const scaling = applyScaling(categories, actualTokens, rawTotal, contextUsage);

  const autocompactBuffer =
    contextWindow > 0 ? SettingsManager.create(ctx.cwd).getCompactionReserveTokens() : 0;
  const used =
    scaling.categories.systemPrompt +
    scaling.categories.userMessages +
    scaling.categories.assistantMessages +
    scaling.categories.toolCalls +
    scaling.categories.toolResults +
    scaling.categories.other;
  const freeSpace = Math.max(0, contextWindow - used - autocompactBuffer);

  const promptOptions = deriveOptionsFromSystemPrompt(ctx, cachedOptions);
  const breakdown = computeSystemPromptBreakdown(
    promptOptions,
    systemPromptText,
    scaling.categories.systemPrompt,
    ctx.cwd,
  );
  const injectedFiles = extractInjectedContextFiles(apiView.messages);
  const toolDefinitions = computeToolDefinitions(pi);
  const compaction = detectCompaction(branch);

  const guidelineBullets = extractGuidelineBullets(extractGuidelinesSection(systemPromptText));

  return {
    modelName: ctx.model?.name ?? ctx.model?.id ?? "No model selected",
    contextWindow,
    totalTokens: scaling.totalTokens,
    scaled: scaling.scaled,
    approximationNote: scaling.approximationNote,
    full,
    categories: {
      ...scaling.categories,
      autocompactBuffer,
      freeSpace,
    },
    systemPromptBreakdown: breakdown,
    injectedFiles,
    skills: breakdown.skills,
    guidelines: breakdown.guidelines,
    guidelineBullets,
    guidelineSources: breakdown.guidelineSources,
    toolSnippetDetails: breakdown.toolSnippetDetails,
    toolDefinitions,
    compaction,
    providerSections: collectProviderData(),
  };
}
