// biome-ignore lint/nursery/noExcessiveLinesPerFile: analysis file is inherently large
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
import { getRegisteredContextProviders } from "@mrclrchtr/supi-core";
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
}

export interface InjectedFileInfo {
  file: string;
  turn: number;
  tokens: number;
}

export interface SkillInfo {
  name: string;
  tokens: number;
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
  categories: CategoryTokens & {
    autocompactBuffer: number;
    freeSpace: number;
  };
  systemPromptBreakdown: {
    base: number;
    contextFiles: ContextFileInfo[];
    skills: SkillInfo[];
    guidelines: number;
    toolSnippets: number;
    appendText: number;
  };
  injectedFiles: InjectedFileInfo[];
  skills: SkillInfo[];
  guidelines: number;
  toolDefinitions: { count: number; tokens: number };
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

function computeContextFiles(
  promptOptions: BuildSystemPromptOptions | undefined,
): ContextFileInfo[] {
  const files: ContextFileInfo[] = [];
  if (promptOptions?.contextFiles) {
    for (const cf of promptOptions.contextFiles) {
      files.push({ path: cf.path, tokens: estimateTextTokens(cf.content) });
    }
  }
  return files;
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

function computeSystemPromptBreakdown(
  promptOptions: BuildSystemPromptOptions | undefined,
  systemPromptText: string,
  systemPromptTokens: number,
): ContextAnalysis["systemPromptBreakdown"] {
  const contextFiles = computeContextFiles(promptOptions);
  const skills = computeSkills(promptOptions);

  const skillsTotal = skills.reduce((s, c) => s + c.tokens, 0);
  const inferredGuidelines = extractGuidelinesSection(systemPromptText);
  const guidelines = inferredGuidelines
    ? estimateTextTokens(inferredGuidelines)
    : promptOptions?.promptGuidelines
      ? estimateTextTokens(promptOptions.promptGuidelines.join("\n"))
      : 0;
  const toolSnippets = promptOptions?.toolSnippets
    ? estimateTextTokens(Object.values(promptOptions.toolSnippets).join("\n"))
    : 0;
  const appendText = promptOptions?.appendSystemPrompt
    ? estimateTextTokens(promptOptions.appendSystemPrompt)
    : 0;
  const customTokens = promptOptions?.customPrompt
    ? estimateTextTokens(promptOptions.customPrompt)
    : 0;

  const knownSubtotal =
    contextFiles.reduce((s, c) => s + c.tokens, 0) +
    skillsTotal +
    guidelines +
    toolSnippets +
    appendText +
    customTokens;

  const base = Math.max(0, systemPromptTokens - knownSubtotal);

  return { base, contextFiles, skills, guidelines, toolSnippets, appendText };
}

function computeToolDefinitions(pi: ExtensionAPI): { count: number; tokens: number } {
  const activeToolNames = new Set(pi.getActiveTools());
  const allTools = pi.getAllTools();
  const activeTools = allTools.filter((t) => activeToolNames.has(t.name));
  return {
    count: activeTools.length,
    tokens: activeTools.reduce(
      (sum, t) =>
        sum +
        estimateTextTokens(
          JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters }),
        ),
      0,
    ),
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
        seen.set(key, { file, turn, tokens: estimateTextTokens(innerContent) });
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
  );
  const injectedFiles = extractInjectedContextFiles(apiView.messages);
  const toolDefinitions = computeToolDefinitions(pi);
  const compaction = detectCompaction(branch);

  return {
    modelName: ctx.model?.name ?? ctx.model?.id ?? "No model selected",
    contextWindow,
    totalTokens: scaling.totalTokens,
    scaled: scaling.scaled,
    approximationNote: scaling.approximationNote,
    categories: {
      ...scaling.categories,
      autocompactBuffer,
      freeSpace,
    },
    systemPromptBreakdown: breakdown,
    injectedFiles,
    skills: breakdown.skills,
    guidelines: breakdown.guidelines,
    toolDefinitions,
    compaction,
    providerSections: collectProviderData(),
  };
}
