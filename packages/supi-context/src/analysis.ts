// biome-ignore lint/style/noExcessiveLinesPerFile: analysis file is inherently large
import { dirname, resolve } from "node:path";
import {
  type BuildSystemPromptOptions,
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionContext,
  estimateTokens,
  formatSkillsForPrompt,
  getLatestCompactionEntry,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { getRegisteredContextProviders } from "@mrclrchtr/supi-core/context";

import {
  analyzeContextCapacity,
  type ContextPressureSnapshot,
  createContextPressureSnapshot,
} from "./capacity.ts";
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

export interface ContextAnalysis extends ContextPressureSnapshot {
  scaled: boolean;
  categories: CategoryTokens;
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
  providerSections: ContextProviderSection[];
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
      user: estimateTokens(msg),
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
      toolResult: estimateTokens(msg),
      other: 0,
    };
  }
  return {
    user: 0,
    assistantText: 0,
    toolCalls: 0,
    toolResult: 0,
    other: estimateTokens(msg),
  };
}

function estimateMessageTokens(msg: AgentMessage): number {
  return estimateTokens(msg);
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

interface ScalingResult {
  categories: CategoryTokens;
  scaled: boolean;
  approximationNote: string | null;
  usedTokens: number;
}

type CurrentContextUsage = ReturnType<ExtensionContext["getContextUsage"]>;

function hasMeasuredTokens(tokens: number | null | undefined): tokens is number {
  return typeof tokens === "number" && tokens > 0;
}

function getApproximationNote(contextUsage: CurrentContextUsage): string | null {
  if (contextUsage === undefined) return "Approximate (no usage data available)";
  return hasMeasuredTokens(contextUsage.tokens)
    ? null
    : "Token count pending — send a message to refresh";
}

function applyScaling(
  categories: CategoryTokens,
  actualTokens: number | null,
  rawTotal: number,
  contextUsage:
    | { tokens: number | null; contextWindow: number; percent: number | null }
    | undefined,
): ScalingResult {
  let scaled = false;
  const hasActualTotal = hasMeasuredTokens(actualTokens);
  const usedTokens = hasActualTotal ? actualTokens : rawTotal;
  const approximationNote = getApproximationNote(contextUsage);

  if (hasActualTotal && rawTotal > 0) {
    const scale = actualTokens / rawTotal;
    categories.systemPrompt = Math.round(categories.systemPrompt * scale);
    categories.userMessages = Math.round(categories.userMessages * scale);
    categories.assistantMessages = Math.round(categories.assistantMessages * scale);
    categories.toolCalls = Math.round(categories.toolCalls * scale);
    categories.toolResults = Math.round(categories.toolResults * scale);
    categories.other = Math.round(categories.other * scale);
    scaled = true;
  }

  return { categories, scaled, approximationNote, usedTokens };
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

function hasCompactionOnActiveBranch(
  branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>,
): boolean {
  return getLatestCompactionEntry(branch) !== null;
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

interface ContextFallback {
  messages: AgentMessage[];
  systemPromptText: string;
}

interface CapacityObservation {
  branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
  contextUsage: CurrentContextUsage;
  snapshot: ContextPressureSnapshot;
  fallback?: ContextFallback;
}

interface ContextObservation extends ContextFallback {
  scaling: ScalingResult;
  snapshot: ContextPressureSnapshot;
}

function estimateContextTokens(fallback: ContextFallback): number {
  return (
    estimateTextTokens(fallback.systemPromptText) +
    fallback.messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
  );
}

function collectContextFallback(
  ctx: ExtensionContext,
  branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>,
): ContextFallback {
  return {
    messages: buildSessionContext(branch).messages,
    systemPromptText: ctx.getSystemPrompt(),
  };
}

/**
 * Observe the small shared capacity seam. It only walks messages when Pi has
 * no measured usage total and an aggregate estimate is genuinely necessary.
 */
function observeCapacity(ctx: ExtensionContext): CapacityObservation {
  const branch = ctx.sessionManager.getBranch();
  const contextUsage = ctx.getContextUsage();
  let fallback: ContextFallback | undefined;
  let usedTokens: number;
  if (hasMeasuredTokens(contextUsage?.tokens)) {
    usedTokens = contextUsage.tokens;
  } else {
    fallback = collectContextFallback(ctx, branch);
    usedTokens = estimateContextTokens(fallback);
  }
  const settings = SettingsManager.create(ctx.cwd, undefined, {
    projectTrusted: ctx.isProjectTrusted(),
  });
  const capacity = analyzeContextCapacity({
    contextWindow: contextUsage?.contextWindow ?? null,
    usedTokens,
    compactionEnabled: settings.getCompactionEnabled(),
    configuredReserveTokens: settings.getCompactionReserveTokens(),
    compacted: hasCompactionOnActiveBranch(branch),
    approximationNote: getApproximationNote(contextUsage),
  });

  return {
    branch,
    contextUsage,
    fallback,
    snapshot: createContextPressureSnapshot(
      ctx.model?.name ?? ctx.model?.id ?? "No model selected",
      capacity,
    ),
  };
}

/** Return a constant-shape Context Pressure Snapshot without diagnostic attribution. */
export function analyzeContextPressure(ctx: ExtensionContext): ContextPressureSnapshot {
  return observeCapacity(ctx).snapshot;
}

/** Compose a full Context Usage Report from shared capacity and diagnostic attribution. */
export function analyzeContext(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  cachedOptions: BuildSystemPromptOptions | undefined,
): ContextAnalysis {
  const capacity = observeCapacity(ctx);
  const fallback = capacity.fallback ?? collectContextFallback(ctx, capacity.branch);
  const categories = computeMessageCategories(fallback.messages);
  categories.systemPrompt = estimateTextTokens(fallback.systemPromptText);
  const rawTotal =
    categories.systemPrompt +
    categories.userMessages +
    categories.assistantMessages +
    categories.toolCalls +
    categories.toolResults +
    categories.other;
  const observation: ContextObservation = {
    ...fallback,
    scaling: applyScaling(
      categories,
      capacity.contextUsage?.tokens ?? null,
      rawTotal,
      capacity.contextUsage,
    ),
    snapshot: capacity.snapshot,
  };
  const promptOptions = deriveOptionsFromSystemPrompt(ctx, cachedOptions);
  const breakdown = computeSystemPromptBreakdown(
    promptOptions,
    observation.systemPromptText,
    observation.scaling.categories.systemPrompt,
    ctx.cwd,
  );
  const injectedFiles = extractInjectedContextFiles(observation.messages);
  const toolDefinitions = computeToolDefinitions(pi);
  const guidelineBullets = extractGuidelineBullets(
    extractGuidelinesSection(observation.systemPromptText),
  );

  return {
    ...observation.snapshot,
    scaled: observation.scaling.scaled,
    categories: observation.scaling.categories,
    systemPromptBreakdown: breakdown,
    injectedFiles,
    skills: breakdown.skills,
    guidelines: breakdown.guidelines,
    guidelineBullets,
    guidelineSources: breakdown.guidelineSources,
    toolSnippetDetails: breakdown.toolSnippetDetails,
    toolDefinitions,
    providerSections: collectProviderData(),
  };
}
