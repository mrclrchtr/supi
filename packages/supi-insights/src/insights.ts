// supi-insights — PI usage insights extension.
//
// Scans historical PI sessions, extracts structured metadata and LLM facets,
// generates narrative insights, and produces a shareable HTML report.

// biome-ignore lint: factory + pipeline in one file keeps phase ordering explicit.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig, registerConfigSettings } from "@mrclrchtr/supi-core";
import { aggregateData } from "./aggregator.ts";
import {
  loadCachedFacets,
  loadCachedMeta,
  makeCacheKey,
  saveCachedFacets,
  saveCachedMeta,
} from "./cache.ts";
import { extractFacets } from "./extractor.ts";
import { generateInsights } from "./generator.ts";
import { generateHtmlReport } from "./html.ts";
import {
  extractSessionMeta,
  formatTranscriptForFacets,
  hasValidDates,
  parseSessionFile,
} from "./parser.ts";
import { scanAllSessions } from "./scanner.ts";
import type { AggregatedData, InsightResults, SessionFacets, SessionMeta } from "./types.ts";

const REPORT_TYPE = "supi-insights-report";
const MAX_SESSIONS_TO_ANALYZE = 200;
const MAX_FACET_EXTRACTIONS = 50;
const META_BATCH_SIZE = 50;
const LOAD_BATCH_SIZE = 10;
const FACET_CONCURRENCY = 50;

type ParsedSessionEntries = Awaited<ReturnType<typeof parseSessionFile>>;

type SessionRecord = {
  session: SessionInfo;
  cacheKey: string;
  meta: SessionMeta;
  entries?: ParsedSessionEntries;
};

// ── Config & Settings ─────────────────────────────────────

interface InsightsConfig {
  enabled: boolean;
  maxSessions: number;
  maxFacets: number;
}

function getConfig(cwd: string): InsightsConfig {
  const defaults = {
    enabled: true,
    maxSessions: MAX_SESSIONS_TO_ANALYZE,
    maxFacets: MAX_FACET_EXTRACTIONS,
  };
  const section = loadSupiConfig<typeof defaults>("insights", cwd, defaults);
  return {
    enabled: section.enabled !== false,
    maxSessions:
      typeof section.maxSessions === "number" ? section.maxSessions : MAX_SESSIONS_TO_ANALYZE,
    maxFacets: typeof section.maxFacets === "number" ? section.maxFacets : MAX_FACET_EXTRACTIONS,
  };
}

// ── Extension Factory ─────────────────────────────────────

export default function insightsExtension(pi: ExtensionAPI) {
  // Register config-backed settings for /supi-settings
  registerConfigSettings<InsightsConfig>({
    id: "insights",
    label: "Insights",
    section: "insights",
    defaults: {
      enabled: true,
      maxSessions: MAX_SESSIONS_TO_ANALYZE,
      maxFacets: MAX_FACET_EXTRACTIONS,
    },
    buildItems: (settings, _scope, _cwd) => [
      {
        id: "enabled",
        label: "Enable insights",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "maxSessions",
        label: "Max sessions to analyze",
        currentValue: String(settings.maxSessions),
        values: ["50", "100", "200", "500"],
      },
      {
        id: "maxFacets",
        label: "Max facet extractions",
        currentValue: String(settings.maxFacets),
        values: ["20", "50", "100"],
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: registerConfigSettings defines this callback shape.
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      const numSettings = new Set(["maxSessions", "maxFacets"]);
      const finalValue = numSettings.has(settingId) ? Number(value) : value === "on";
      helpers.set(settingId, finalValue);
    },
  });

  // ── /supi-insights command ──────────────────────────────────

  pi.registerCommand("supi-insights", {
    description: "Generate a report analyzing your PI sessions",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: command handler coordinates UI and report generation flow.
    handler: async (_args, ctx) => {
      const config = getConfig(ctx.cwd);
      if (!config.enabled) {
        ctx.ui.notify("Insights are disabled. Enable via /supi-settings.", "warning");
        return;
      }

      ctx.ui.setWorkingMessage("Analyzing sessions...");

      try {
        const report = await generateReport(ctx, config);
        ctx.ui.setWorkingMessage();

        if (!report) {
          ctx.ui.notify("No sessions found to analyze.", "info");
          return;
        }

        // Save HTML report
        const reportDir = join(getAgentDir(), "supi", "insights");
        await mkdir(reportDir, { recursive: true });
        const htmlPath = join(reportDir, `report-${Date.now()}.html`);
        await writeFile(htmlPath, report.html, { encoding: "utf-8", mode: 0o600 });

        // Send custom message with summary
        const failureNote =
          report.data.facetExtractionFailed > 0
            ? `${report.data.facetExtractionFailed} facet extractions failed`
            : report.data.insightSectionsFailed.length > 0
              ? `${report.data.insightSectionsFailed.length} insight sections unavailable`
              : undefined;
        const stats = [
          `${report.data.totalSessions} sessions`,
          `${report.data.totalMessages.toLocaleString()} messages`,
          `${Math.round(report.data.totalDurationHours)}h`,
          `${report.data.gitCommits} commits`,
          ...(failureNote ? [`⚠ ${failureNote}`] : []),
        ].join(" · ");

        const header = `# PI Insights\n\n${stats}\n${report.data.dateRange.start} to ${report.data.dateRange.end}\n`;

        const atAGlance = report.insights.atAGlance as
          | { whatsWorking?: string; quickWins?: string }
          | undefined;

        const summaryText = atAGlance
          ? `## At a Glance\n\n${atAGlance.whatsWorking ? `**What's working:** ${atAGlance.whatsWorking}` : ""}\n\n${atAGlance.quickWins ? `**Quick wins:** ${atAGlance.quickWins}` : ""}`
          : "_No narrative insights generated_";

        const userSummary = `${header}\n${summaryText}\n\nYour full report is ready: file://${htmlPath}`;

        pi.sendMessage({
          customType: REPORT_TYPE,
          content: `${stats} | ${report.data.dateRange.start} to ${report.data.dateRange.end}`,
          display: true,
          details: {
            htmlPath,
            summary: userSummary,
            data: report.data,
            insights: report.insights,
          },
        });

        ctx.ui.notify(`Insights report saved: ${htmlPath}`, "info");
      } catch (err) {
        ctx.ui.setWorkingMessage();
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Insights generation failed: ${message}`, "error");
      }
    },
  });
}

// ── Report Generation ─────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: report generation orchestrates sequential scan/cache/facet/render phases.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: keeping the pipeline together makes phase ordering explicit.
async function generateReport(
  ctx: ExtensionCommandContext,
  config: InsightsConfig,
): Promise<{ data: AggregatedData; insights: InsightResults; html: string } | null> {
  // Phase 1: Scan all sessions
  const allSessions = await scanAllSessions((loaded, total) => {
    ctx.ui.setStatus("supi-insights", `Scanning sessions... ${loaded}/${total}`);
  });
  ctx.ui.setStatus("supi-insights", undefined);

  if (allSessions.length === 0) return null;

  const totalSessionsScanned = allSessions.length;

  // Phase 2: Load cached metas, parse uncached sessions. Keep the branch-specific
  // path/cache key attached to each meta so later facet work uses the same branch.
  let records: SessionRecord[] = [];
  const uncachedSessions: SessionInfo[] = [];

  for (let i = 0; i < allSessions.length; i += META_BATCH_SIZE) {
    const batch = allSessions.slice(i, i + META_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (session) => {
        const cacheKey = makeCacheKey(session.id, session.path, session.modified.getTime());
        return {
          session,
          cacheKey,
          cached: await loadCachedMeta(cacheKey),
        };
      }),
    );
    for (const { session, cacheKey, cached } of results) {
      if (cached) {
        records.push({ session, cacheKey, meta: cached });
      } else if (uncachedSessions.length < config.maxSessions) {
        uncachedSessions.push(session);
      }
    }
  }

  // Parse uncached sessions in batches.
  for (let i = 0; i < uncachedSessions.length; i += LOAD_BATCH_SIZE) {
    const batch = uncachedSessions.slice(i, i + LOAD_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (session) => {
        try {
          const entries = await parseSessionFile(session.path);
          return { session, entries, ok: true as const };
        } catch {
          return {
            session,
            entries: [] as ParsedSessionEntries,
            ok: false as const,
          };
        }
      }),
    );

    const metasToSave: { meta: SessionMeta; cacheKey: string }[] = [];
    for (const { session, entries, ok } of batchResults) {
      if (!ok || !hasValidDates(entries)) continue;
      const meta = extractSessionMeta(entries, session.id, session.cwd);
      const cacheKey = makeCacheKey(session.id, session.path, session.modified.getTime());
      records.push({ session, cacheKey, meta, entries });
      metasToSave.push({ meta, cacheKey });
    }

    await Promise.all(metasToSave.map(({ meta, cacheKey }) => saveCachedMeta(cacheKey, meta)));
  }

  // Deduplicate by session id while preserving the winning branch's path/cache key.
  const bestBySession = new Map<string, SessionRecord>();
  for (const record of records) {
    const existing = bestBySession.get(record.meta.sessionId);
    if (!existing || isBetterBranch(record, existing)) {
      bestBySession.set(record.meta.sessionId, record);
    }
  }
  records = [...bestBySession.values()];

  // Sort by start time descending, then apply maxSessions cap consistently to cached + uncached metas.
  records.sort((a, b) => b.meta.startTime.localeCompare(a.meta.startTime));
  records = records.slice(0, config.maxSessions);

  // Filter substantive sessions.
  const substantiveRecords = records.filter(
    ({ meta }) => meta.userMessageCount >= 2 && meta.durationMinutes >= 1,
  );

  // Phase 3: Facet extraction.
  const facets = new Map<string, SessionFacets>();
  const toExtract: Array<{ record: SessionRecord; entries: ParsedSessionEntries }> = [];

  for (let i = 0; i < substantiveRecords.length; i += LOAD_BATCH_SIZE) {
    const batch = substantiveRecords.slice(i, i + LOAD_BATCH_SIZE);
    const cachedFacetResults = await Promise.all(
      batch.map(async (record) => ({
        record,
        cached: await loadCachedFacets(record.cacheKey),
      })),
    );

    for (const { record, cached } of cachedFacetResults) {
      if (cached) {
        facets.set(record.meta.sessionId, cached);
        continue;
      }
      if (toExtract.length >= config.maxFacets) continue;

      try {
        const entries = record.entries ?? (await parseSessionFile(record.session.path));
        if (!hasValidDates(entries)) continue;
        record.entries = entries;
        toExtract.push({ record, entries });
      } catch {
        // Session may have been deleted or become unreadable since listAll().
      }
    }
  }

  // Extract facets in parallel batches, tracking attempts and failures.
  let facetExtractionAttempted = 0;
  let facetExtractionFailed = 0;
  ctx.ui.setStatus("supi-insights", `Extracting facets... 0/${toExtract.length}`);
  for (let i = 0; i < toExtract.length; i += FACET_CONCURRENCY) {
    const batch = toExtract.slice(i, i + FACET_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ record, entries }) => {
        const transcript = formatTranscriptForFacets(entries, record.meta);
        facetExtractionAttempted++;
        return {
          record,
          facets: await extractFacets(transcript, record.meta.sessionId, ctx),
        };
      }),
    );

    const facetsToSave: { facets: SessionFacets; cacheKey: string }[] = [];
    for (const result of results) {
      const newFacets = result.facets;
      if (newFacets) {
        facets.set(result.record.meta.sessionId, newFacets);
        facetsToSave.push({ facets: newFacets, cacheKey: result.record.cacheKey });
      } else {
        facetExtractionFailed++;
      }
    }
    await Promise.all(
      facetsToSave.map(({ facets, cacheKey }) => saveCachedFacets(cacheKey, facets)),
    );
    ctx.ui.setStatus(
      "supi-insights",
      `Extracting facets... ${Math.min(i + FACET_CONCURRENCY, toExtract.length)}/${toExtract.length}`,
    );
  }
  ctx.ui.setStatus("supi-insights", undefined);

  // Filter out warmup-only sessions.
  const isMinimalSession = (sessionId: string): boolean => {
    const sessionFacets = facets.get(sessionId);
    if (!sessionFacets) return false;
    const cats = Object.entries(sessionFacets.goalCategories).filter(([, count]) => count > 0);
    return cats.length === 1 && cats[0]?.[0] === "warmup_minimal";
  };

  const finalSessions = substantiveRecords
    .map((record) => record.meta)
    .filter((session) => !isMinimalSession(session.sessionId));
  const finalFacets = new Map<string, SessionFacets>();
  for (const [sessionId, f] of facets) {
    if (!isMinimalSession(sessionId)) {
      finalFacets.set(sessionId, f);
    }
  }

  // Phase 4: Aggregate
  const aggregated = aggregateData(finalSessions, finalFacets);
  aggregated.totalSessionsScanned = totalSessionsScanned;
  aggregated.facetExtractionAttempted = facetExtractionAttempted;
  aggregated.facetExtractionFailed = facetExtractionFailed;

  // Phase 5: Generate insights
  const insights = await generateInsights(aggregated, finalFacets, ctx);

  // Track which insight sections failed to generate.
  const insightSectionsFailed: string[] = [];
  for (const sectionName of [
    "projectAreas",
    "interactionStyle",
    "whatWorks",
    "frictionAnalysis",
    "suggestions",
    "onTheHorizon",
    "funEnding",
    "atAGlance",
  ] as const) {
    if (!insights[sectionName]) {
      insightSectionsFailed.push(sectionName);
    }
  }
  aggregated.insightSectionsFailed = insightSectionsFailed;

  // Phase 6: Render HTML
  const htmlReport = generateHtmlReport(aggregated, insights);

  return { data: aggregated, insights, html: htmlReport };
}

function isBetterBranch(candidate: SessionRecord, current: SessionRecord): boolean {
  const a = candidate.meta;
  const b = current.meta;
  if (a.userMessageCount !== b.userMessageCount) {
    return a.userMessageCount > b.userMessageCount;
  }
  if (a.durationMinutes !== b.durationMinutes) {
    return a.durationMinutes > b.durationMinutes;
  }
  return candidate.session.modified.getTime() > current.session.modified.getTime();
}
