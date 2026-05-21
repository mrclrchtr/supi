import type { SessionContext } from "@earendil-works/pi-coding-agent";
import type { HistoryEvidence, ReviewSnapshot } from "../types.ts";

const INTENT_PATTERN =
  /\b(fix|refactor|rename|preserve|avoid|should|must|ensure|intended|goal|risk|concern|regression|security|correctness|performance|api|breaking|review)\b/i;

type ResolvedSessionMessage = SessionContext["messages"][number];

/**
 * Extract the highest-signal evidence from the resolved LLM-visible session context.
 *
 * The collector intentionally favors user intent, assistant plans, compaction
 * summaries, and custom extension messages over raw tool chatter.
 */
export function collectHistoryEvidence(
  messages: ResolvedSessionMessage[],
  snapshot: ReviewSnapshot,
  note?: string,
): HistoryEvidence[] {
  const scoringContext = {
    changedPathTokens: collectPathTokens(snapshot.changedFiles),
    noteTokens: collectFreeformTokens(note),
    total: messages.length,
  };

  const scored = messages
    .map((message) => toEvidence(message))
    .filter(
      (evidence): evidence is Omit<HistoryEvidence, "score" | "reason"> => evidence !== undefined,
    )
    .map((evidence, index) => scoreEvidence(evidence, index, scoringContext))
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  return capEvidence(scored, 10, 4_500);
}

function toEvidence(
  message: ResolvedSessionMessage,
): Omit<HistoryEvidence, "score" | "reason"> | undefined {
  switch (message.role) {
    case "user":
    case "assistant": {
      return {
        kind: message.role,
        text: normalizeText(extractMessageText(message.content)),
      };
    }
    case "custom": {
      return {
        kind: "custom",
        text: normalizeText(extractMessageText(message.content)),
      };
    }
    case "compactionSummary": {
      return {
        kind: "compaction",
        text: normalizeText(message.summary),
      };
    }
    case "branchSummary": {
      return {
        kind: "branch-summary",
        text: normalizeText(message.summary),
      };
    }
    default:
      return undefined;
  }
}

function scoreEvidence(
  evidence: Omit<HistoryEvidence, "score" | "reason">,
  index: number,
  context: { total: number; changedPathTokens: string[]; noteTokens: string[] },
): HistoryEvidence {
  const recencyBoost = context.total > 0 ? (index / context.total) * 3 : 0;
  const pathMatches = countTokenMatches(evidence.text, context.changedPathTokens);
  const noteMatches = countTokenMatches(evidence.text, context.noteTokens);
  const intentBoost = INTENT_PATTERN.test(evidence.text) ? 4 : 0;
  const shortTextPenalty = evidence.text.length < 24 ? -2 : 0;
  const longTextPenalty = evidence.text.length > 900 ? -1 : 0;
  const score =
    baseKindScore(evidence.kind) +
    recencyBoost +
    pathMatches * 3 +
    noteMatches * 2 +
    intentBoost +
    shortTextPenalty +
    longTextPenalty;

  return {
    ...evidence,
    score,
    reason: buildReason(pathMatches, noteMatches, intentBoost),
  };
}

function buildReason(pathMatches: number, noteMatches: number, intentBoost: number): string {
  const reasons: string[] = [];
  if (pathMatches > 0) {
    reasons.push(`mentions ${pathMatches} changed-path token${pathMatches === 1 ? "" : "s"}`);
  }
  if (noteMatches > 0) {
    reasons.push(`matches ${noteMatches} note token${noteMatches === 1 ? "" : "s"}`);
  }
  if (intentBoost > 0) {
    reasons.push("contains intent/constraint language");
  }
  return reasons.join(", ") || "high-signal session context";
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part !== "object" || !part) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function collectPathTokens(paths: string[]): string[] {
  const tokens = new Set<string>();

  for (const path of paths) {
    for (const part of path.split(/[\\/]/)) {
      addToken(tokens, part);
      for (const inner of part.split(/[-_.]/)) {
        addToken(tokens, inner);
      }
    }
    addToken(tokens, path);
  }

  return Array.from(tokens);
}

function collectFreeformTokens(text: string | undefined): string[] {
  if (!text) return [];

  const tokens = new Set<string>();
  for (const part of text.split(/\W+/)) {
    addToken(tokens, part);
  }
  return Array.from(tokens);
}

function addToken(tokens: Set<string>, token: string): void {
  const normalized = token.trim().toLowerCase();
  if (normalized.length < 3) return;
  tokens.add(normalized);
}

function countTokenMatches(text: string, tokens: string[]): number {
  if (tokens.length === 0 || text.length === 0) return 0;
  const lower = text.toLowerCase();
  return tokens.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
}

function baseKindScore(kind: HistoryEvidence["kind"]): number {
  switch (kind) {
    case "user":
      return 8;
    case "assistant":
      return 5;
    case "compaction":
    case "branch-summary":
      return 6;
    case "custom":
      return 4;
  }
}

function capEvidence(
  evidence: HistoryEvidence[],
  maxItems: number,
  maxChars: number,
): HistoryEvidence[] {
  const kept: HistoryEvidence[] = [];
  let used = 0;

  for (const item of evidence) {
    if (kept.length >= maxItems) break;
    const text = truncate(item.text, 600);
    const nextUsed = used + text.length;
    if (kept.length > 0 && nextUsed > maxChars) break;
    kept.push({ ...item, text });
    used = nextUsed;
  }

  return kept;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}
