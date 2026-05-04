// Data aggregator — combine session metadata and facets into aggregated statistics.

import type { AggregatedData, SessionFacets, SessionMeta } from "./types.ts";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: aggregation intentionally combines many independent report counters.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: keeping the aggregation flow together makes metric interactions easier to audit.
export function aggregateData(
  sessions: SessionMeta[],
  facets: Map<string, SessionFacets>,
): AggregatedData {
  const result: AggregatedData = {
    totalSessions: sessions.length,
    sessionsWithFacets: facets.size,
    dateRange: { start: "", end: "" },
    totalMessages: 0,
    totalDurationHours: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    toolCounts: {},
    languages: {},
    gitCommits: 0,
    gitPushes: 0,
    projects: {},
    goalCategories: {},
    outcomes: {},
    satisfaction: {},
    helpfulness: {},
    sessionTypes: {},
    friction: {},
    success: {},
    sessionSummaries: [],
    totalInterruptions: 0,
    totalToolErrors: 0,
    toolErrorCategories: {},
    userResponseTimes: [],
    medianResponseTime: 0,
    avgResponseTime: 0,
    sessionsUsingTaskAgent: 0,
    sessionsUsingMcp: 0,
    sessionsUsingWebSearch: 0,
    sessionsUsingWebFetch: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    totalFilesModified: 0,
    daysActive: 0,
    messagesPerDay: 0,
    messageHours: [],
    multiClauding: {
      overlapEvents: 0,
      sessionsInvolved: 0,
      userMessagesDuring: 0,
    },
    facetExtractionAttempted: 0,
    facetExtractionFailed: 0,
    insightSectionsFailed: [],
  };

  const dates: string[] = [];
  const allResponseTimes: number[] = [];
  const allMessageHours: number[] = [];

  for (const session of sessions) {
    dates.push(session.startTime);
    result.totalMessages += session.userMessageCount;
    result.totalDurationHours += session.durationMinutes / 60;
    result.totalInputTokens += session.inputTokens;
    result.totalOutputTokens += session.outputTokens;
    result.gitCommits += session.gitCommits;
    result.gitPushes += session.gitPushes;

    result.totalInterruptions += session.userInterruptions;
    result.totalToolErrors += session.toolErrors;
    for (const [cat, count] of Object.entries(session.toolErrorCategories)) {
      result.toolErrorCategories[cat] = (result.toolErrorCategories[cat] ?? 0) + count;
    }
    allResponseTimes.push(...session.userResponseTimes);
    if (session.usesTaskAgent) result.sessionsUsingTaskAgent++;
    if (session.usesMcp) result.sessionsUsingMcp++;
    if (session.usesWebSearch) result.sessionsUsingWebSearch++;
    if (session.usesWebFetch) result.sessionsUsingWebFetch++;

    result.totalLinesAdded += session.linesAdded;
    result.totalLinesRemoved += session.linesRemoved;
    result.totalFilesModified += session.filesModified;
    allMessageHours.push(...session.messageHours);

    for (const [tool, count] of Object.entries(session.toolCounts)) {
      result.toolCounts[tool] = (result.toolCounts[tool] ?? 0) + count;
    }

    for (const [lang, count] of Object.entries(session.languages)) {
      result.languages[lang] = (result.languages[lang] ?? 0) + count;
    }

    if (session.projectPath) {
      result.projects[session.projectPath] = (result.projects[session.projectPath] ?? 0) + 1;
    }

    const sessionFacets = facets.get(session.sessionId);
    if (sessionFacets) {
      for (const [cat, count] of safeEntries(sessionFacets.goalCategories)) {
        if (count > 0) {
          result.goalCategories[cat] = (result.goalCategories[cat] ?? 0) + count;
        }
      }

      result.outcomes[sessionFacets.outcome] = (result.outcomes[sessionFacets.outcome] ?? 0) + 1;

      for (const [level, count] of safeEntries(sessionFacets.userSatisfactionCounts)) {
        if (count > 0) {
          result.satisfaction[level] = (result.satisfaction[level] ?? 0) + count;
        }
      }

      result.helpfulness[sessionFacets.claudeHelpfulness] =
        (result.helpfulness[sessionFacets.claudeHelpfulness] ?? 0) + 1;

      result.sessionTypes[sessionFacets.sessionType] =
        (result.sessionTypes[sessionFacets.sessionType] ?? 0) + 1;

      for (const [type, count] of safeEntries(sessionFacets.frictionCounts)) {
        if (count > 0) {
          result.friction[type] = (result.friction[type] ?? 0) + count;
        }
      }

      if (sessionFacets.primarySuccess !== "none") {
        result.success[sessionFacets.primarySuccess] =
          (result.success[sessionFacets.primarySuccess] ?? 0) + 1;
      }
    }

    if (result.sessionSummaries.length < 50) {
      result.sessionSummaries.push({
        id: session.sessionId.slice(0, 8),
        date: session.startTime.split("T")[0] ?? "",
        summary: session.summary ?? session.firstPrompt.slice(0, 100),
        goal: sessionFacets?.underlyingGoal,
      });
    }
  }

  dates.sort((a, b) => a.localeCompare(b));
  result.dateRange.start = dates[0]?.split("T")[0] ?? "";
  result.dateRange.end = dates[dates.length - 1]?.split("T")[0] ?? "";

  result.userResponseTimes = allResponseTimes;
  if (allResponseTimes.length > 0) {
    const sorted = [...allResponseTimes].sort((a, b) => a - b);
    result.medianResponseTime = sorted[Math.floor(sorted.length / 2)] ?? 0;
    result.avgResponseTime = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
  }

  const uniqueDays = new Set(dates.map((d) => d.split("T")[0]));
  result.daysActive = uniqueDays.size;
  result.messagesPerDay =
    result.daysActive > 0 ? Math.round((result.totalMessages / result.daysActive) * 10) / 10 : 0;

  result.messageHours = allMessageHours;
  result.multiClauding = detectMultiClauding(sessions);

  return result;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sliding-window overlap detection is clearer in one pass.
function detectMultiClauding(
  sessions: Array<{ sessionId: string; userMessageTimestamps: string[] }>,
): { overlapEvents: number; sessionsInvolved: number; userMessagesDuring: number } {
  const OVERLAP_WINDOW_MS = 30 * 60000;
  const allMessages: Array<{ ts: number; sessionId: string }> = [];

  for (const session of sessions) {
    for (const timestamp of session.userMessageTimestamps) {
      try {
        const ts = new Date(timestamp).getTime();
        allMessages.push({ ts, sessionId: session.sessionId });
      } catch {
        // skip
      }
    }
  }

  allMessages.sort((a, b) => a.ts - b.ts);

  const multiClaudeSessionPairs = new Set<string>();
  const messagesDuringMulticlaude = new Set<string>();

  let windowStart = 0;
  const sessionLastIndex = new Map<string, number>();

  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (!msg) continue;

    let windowStartMessage = allMessages[windowStart];
    while (
      windowStart < i &&
      windowStartMessage &&
      msg.ts - windowStartMessage.ts > OVERLAP_WINDOW_MS
    ) {
      if (sessionLastIndex.get(windowStartMessage.sessionId) === windowStart) {
        sessionLastIndex.delete(windowStartMessage.sessionId);
      }
      windowStart++;
      windowStartMessage = allMessages[windowStart];
    }

    const prevIndex = sessionLastIndex.get(msg.sessionId);
    if (prevIndex !== undefined) {
      const previous = allMessages[prevIndex];
      for (let j = prevIndex + 1; j < i; j++) {
        const between = allMessages[j];
        if (between && previous && between.sessionId !== msg.sessionId) {
          const pair = [msg.sessionId, between.sessionId]
            .sort((a, b) => a.localeCompare(b))
            .join(":");
          multiClaudeSessionPairs.add(pair);
          messagesDuringMulticlaude.add(`${previous.ts}:${msg.sessionId}`);
          messagesDuringMulticlaude.add(`${between.ts}:${between.sessionId}`);
          messagesDuringMulticlaude.add(`${msg.ts}:${msg.sessionId}`);
          break;
        }
      }
    }

    sessionLastIndex.set(msg.sessionId, i);
  }

  const sessionsWithOverlaps = new Set<string>();
  for (const pair of multiClaudeSessionPairs) {
    const [s1, s2] = pair.split(":");
    if (s1) sessionsWithOverlaps.add(s1);
    if (s2) sessionsWithOverlaps.add(s2);
  }

  return {
    overlapEvents: multiClaudeSessionPairs.size,
    sessionsInvolved: sessionsWithOverlaps.size,
    userMessagesDuring: messagesDuringMulticlaude.size,
  };
}

function safeEntries<V>(obj: Record<string, V> | undefined | null): [string, V][] {
  return obj ? Object.entries(obj) : [];
}
