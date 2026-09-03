import type { Usage } from "@earendil-works/pi-ai";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { isWebToolName, isWorkspaceToolName } from "../../activity.ts";
import type {
  AntigravityExecutionFacts,
  AntigravityRunResultDetails,
  AntigravityUsage,
  ClassifiedSource,
  ClassifiedWorkspaceEvidence,
  ConversationHandleRecord,
} from "../../types.ts";
import { classifyAnswerEvidence } from "./evidence.ts";

/** PI's hard result bounds for model-visible Antigravity output. */
export const MAX_RESULT_BYTES = 50 * 1024;
export const MAX_RESULT_LINES = 2_000;

/** Inputs needed to assemble one completed Antigravity Run result. */
export interface AntigravityResultOptions {
  facts: AntigravityExecutionFacts;
  handle: ConversationHandleRecord;
  durationMs: number;
  hookWarning?: string;
}

/** Assemble model-visible evidence and free structured renderer details. */
export function buildAntigravityResult(
  options: AntigravityResultOptions,
): AgentToolResult<AntigravityRunResultDetails> {
  const { facts, handle } = options;
  const evidence = classifyAnswerEvidence(facts.answer, facts, handle.canonicalWorkingDirectory);
  const webUsed = facts.successfulToolNames.some(isWebToolName);
  const workspaceUsed = facts.successfulToolNames.some(isWorkspaceToolName);
  const warnings = buildWarnings({
    evidenceWarnings: evidence.warnings,
    observedSourceCount: evidence.observedSources.length,
    observedWorkspaceEvidenceCount: evidence.observedWorkspaceEvidence.length,
    webUsed,
    workspaceUsed,
    permissionDenials: facts.permissionDenials,
    hookWarning: options.hookWarning,
  });
  const details: AntigravityRunResultDetails = {
    model: handle.model,
    workingDirectoryKind: handle.workspaceAccess ? "workspace" : "consultation",
    canonicalWorkingDirectory: handle.canonicalWorkingDirectory,
    workspaceAccess: handle.workspaceAccess,
    cliVersion: handle.cliVersion,
    durationMs: Math.max(0, Math.floor(options.durationMs)),
    ...(facts.usage ? { usage: facts.usage } : {}),
    observedToolNames: facts.observedToolNames,
    observedToolCounts: facts.observedToolCounts,
    permissionDenials: facts.permissionDenials,
    webUsed,
    workspaceUsed,
    ambientProjectGuidanceAvailable: handle.workspaceAccess,
    ...(options.hookWarning ? { activeProjectHookWarning: options.hookWarning } : {}),
    handle: handle.handle,
    rawAntigravityId: handle.rawAntigravityId,
    handleState: "active",
    observedSources: evidence.observedSources,
    claimedSources: evidence.claimedSources,
    observedWorkspaceEvidence: evidence.observedWorkspaceEvidence,
    claimedWorkspaceEvidence: evidence.claimedWorkspaceEvidence,
    warnings,
  };
  const text = formatModelResult(facts.answer.answer, details);
  return {
    content: [{ type: "text", text }],
    details,
    ...(facts.usage ? { usage: toPiUsage(facts.usage) } : {}),
  };
}

function formatModelResult(answer: string, details: AntigravityRunResultDetails): string {
  const sections = [
    answer.trim(),
    "",
    `Web Capability: ${details.webUsed ? "used" : "not used"}`,
    `Workspace Access: ${details.workspaceAccess ? "current workspace" : "Consultation Workspace"}`,
    `Ambient Project Guidance: ${details.ambientProjectGuidanceAvailable ? "available" : "not available"}`,
    formatSources("Observed Sources", details.observedSources),
    formatSources("Claimed Sources (not observed)", details.claimedSources),
    formatWorkspace("Observed Workspace Evidence", details.observedWorkspaceEvidence),
    formatWorkspace("Claimed Workspace Evidence (not observed)", details.claimedWorkspaceEvidence),
    formatWarnings(details.warnings),
    `Conversation Handle: ${details.handle}`,
  ];
  return boundResult(sections.filter((section) => section.length > 0).join("\n"));
}

function formatSources(title: string, sources: readonly ClassifiedSource[]): string {
  if (sources.length === 0) return `${title}: none`;
  return [
    title,
    ...sources.map((source) => `- [${safeMarkdown(source.title)}](${source.url})`),
  ].join("\n");
}

function formatWorkspace(title: string, evidence: readonly ClassifiedWorkspaceEvidence[]): string {
  if (evidence.length === 0) return `${title}: none`;
  return [title, ...evidence.map((item) => `- ${item.path}: ${safeMarkdown(item.summary)}`)].join(
    "\n",
  );
}

function formatWarnings(warnings: readonly string[]): string {
  return warnings.length > 0
    ? ["Warnings", ...warnings.map((warning) => `- ${warning}`)].join("\n")
    : "Warnings: none";
}

function buildWarnings(options: {
  evidenceWarnings: readonly string[];
  observedSourceCount: number;
  observedWorkspaceEvidenceCount: number;
  webUsed: boolean;
  workspaceUsed: boolean;
  permissionDenials: number;
  hookWarning?: string;
}): string[] {
  const warnings = [...options.evidenceWarnings];
  if (options.hookWarning) warnings.push(options.hookWarning);
  if (options.permissionDenials > 0) {
    warnings.push(
      `${options.permissionDenials} Antigravity tool action(s) were denied by permissions.`,
    );
  }
  if (options.webUsed && options.observedSourceCount === 0) {
    warnings.push("Antigravity used web tools, but no source URL was observed in the answer.");
  }
  if (options.workspaceUsed && options.observedWorkspaceEvidenceCount === 0) {
    warnings.push(
      "Antigravity used workspace tools, but no workspace path was observed in the answer.",
    );
  }
  return [...new Set(warnings)].slice(0, 24);
}

function boundResult(value: string): string {
  const lines = value.split(/\r?\n/);
  const result = lines.slice(0, MAX_RESULT_LINES).join("\n");
  const truncated =
    lines.length > MAX_RESULT_LINES || Buffer.byteLength(result, "utf8") > MAX_RESULT_BYTES;
  if (!truncated) return result;

  const marker = "[Antigravity result truncated to PI limits]";
  const markerBytes = Buffer.byteLength(marker, "utf8") + 1;
  const contentLimit = Math.max(0, MAX_RESULT_BYTES - markerBytes);
  const contentLines = result.split(/\r?\n/).slice(0, MAX_RESULT_LINES - 1);
  const content = truncateUtf8(contentLines.join("\n"), contentLimit);
  return content ? `${content}\n${marker}` : marker;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function safeMarkdown(value: string): string {
  return value
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replace(/[\r\n]/g, " ");
}

function toPiUsage(usage: AntigravityUsage): Usage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? input + output;
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
