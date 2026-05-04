// HTML report renderer — generate a shareable HTML insights report.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AggregatedData, InsightResults } from "./types.ts";
import {
  emptyHtml,
  escapeHtmlWithBold,
  escapeXmlAttr,
  generateBarChartHtml,
  generateResponseTimeHistogramHtml,
  generateTimeOfDayChartHtml,
  getHourCountsJson,
  OUTCOME_ORDER,
  SATISFACTION_ORDER,
} from "./utils.ts";

const REPORT_CSS = readFileSync(join(__dirname, "report.css"), "utf-8");
const REPORT_JS_TEMPLATE = readFileSync(join(__dirname, "report.js"), "utf-8");

function generateReportJs(hourCountsJson: string): string {
  return REPORT_JS_TEMPLATE.replace("__HOUR_COUNTS_JSON__", hourCountsJson);
}

function renderAtAGlanceHtml(insights: InsightResults): string {
  const atAGlance = insights.atAGlance as
    | {
        whatsWorking?: string;
        whatsHindering?: string;
        quickWins?: string;
        ambitiousWorkflows?: string;
      }
    | undefined;

  if (!atAGlance) return "";

  return `
    <div class="at-a-glance">
      <div class="glance-title">At a Glance</div>
      <div class="glance-sections">
        ${atAGlance.whatsWorking ? `<div class="glance-section"><strong>What's working:</strong> ${escapeHtmlWithBold(atAGlance.whatsWorking)}</div>` : ""}
        ${atAGlance.whatsHindering ? `<div class="glance-section"><strong>What's hindering you:</strong> ${escapeHtmlWithBold(atAGlance.whatsHindering)}</div>` : ""}
        ${atAGlance.quickWins ? `<div class="glance-section"><strong>Quick wins to try:</strong> ${escapeHtmlWithBold(atAGlance.quickWins)}</div>` : ""}
        ${atAGlance.ambitiousWorkflows ? `<div class="glance-section"><strong>Ambitious workflows:</strong> ${escapeHtmlWithBold(atAGlance.ambitiousWorkflows)}</div>` : ""}
      </div>
    </div>
    `;
}

function renderProjectAreasHtml(insights: InsightResults): string {
  const projectAreas =
    (
      insights.projectAreas as
        | { areas?: Array<{ name: string; sessionCount: number; description: string }> }
        | undefined
    )?.areas || [];

  if (projectAreas.length === 0) return "";

  return `
    <h2>What You Work On</h2>
    <div class="project-areas">
      ${projectAreas
        .map(
          (area) => `
        <div class="project-area">
          <div class="area-header">
            <span class="area-name">${escapeXmlAttr(area.name)}</span>
            <span class="area-count">~${area.sessionCount} sessions</span>
          </div>
          <div class="area-desc">${escapeXmlAttr(area.description)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    `;
}

function renderInteractionHtml(insights: InsightResults): string {
  const interactionStyle = insights.interactionStyle as
    | { narrative?: string; keyPattern?: string }
    | undefined;

  if (!interactionStyle?.narrative) return "";

  return `
    <h2>How You Use PI</h2>
    <div class="narrative">
      ${markdownToHtml(interactionStyle.narrative)}
      ${interactionStyle.keyPattern ? `<div class="key-insight"><strong>Key pattern:</strong> ${escapeXmlAttr(interactionStyle.keyPattern)}</div>` : ""}
    </div>
    `;
}

function renderWhatWorksHtml(insights: InsightResults): string {
  const whatWorks = insights.whatWorks as
    | { intro?: string; impressiveWorkflows?: Array<{ title: string; description: string }> }
    | undefined;

  if (!whatWorks?.impressiveWorkflows?.length) return "";

  return `
    <h2>Impressive Things You Did</h2>
    ${whatWorks.intro ? `<p class="section-intro">${escapeXmlAttr(whatWorks.intro)}</p>` : ""}
    <div class="big-wins">
      ${whatWorks.impressiveWorkflows
        .map(
          (wf) => `
        <div class="big-win">
          <div class="big-win-title">${escapeXmlAttr(wf.title || "")}</div>
          <div class="big-win-desc">${escapeXmlAttr(wf.description || "")}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    `;
}

function renderFrictionHtml(insights: InsightResults): string {
  const frictionAnalysis = insights.frictionAnalysis as
    | {
        intro?: string;
        categories?: Array<{ category: string; description: string; examples?: string[] }>;
      }
    | undefined;

  if (!frictionAnalysis?.categories?.length) return "";

  return `
    <h2>Where Things Go Wrong</h2>
    ${frictionAnalysis.intro ? `<p class="section-intro">${escapeXmlAttr(frictionAnalysis.intro)}</p>` : ""}
    <div class="friction-categories">
      ${frictionAnalysis.categories
        .map(
          (cat) => `
        <div class="friction-category">
          <div class="friction-title">${escapeXmlAttr(cat.category || "")}</div>
          <div class="friction-desc">${escapeXmlAttr(cat.description || "")}</div>
          ${cat.examples ? `<ul class="friction-examples">${cat.examples.map((ex) => `<li>${escapeXmlAttr(ex)}</li>`).join("")}</ul>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    `;
}

function renderSuggestionsHtml(insights: InsightResults): string {
  const suggestions = insights.suggestions as
    | {
        claudeMdAdditions?: Array<{ addition: string; why: string; promptScaffold?: string }>;
        featuresToTry?: Array<{
          feature: string;
          oneLiner: string;
          whyForYou: string;
          exampleCode?: string;
        }>;
        usagePatterns?: Array<{
          title: string;
          suggestion: string;
          detail?: string;
          copyablePrompt?: string;
        }>;
      }
    | undefined;

  if (!suggestions) return "";

  return `
    ${
      suggestions.claudeMdAdditions?.length
        ? `
    <h2>Suggested CLAUDE.md Additions</h2>
    <div class="claude-md-section">
      ${suggestions.claudeMdAdditions
        .map(
          (add) => `
        <div class="claude-md-item">
          <code class="cmd-code">${escapeXmlAttr(add.addition)}</code>
          <div class="cmd-why">${escapeXmlAttr(add.why)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    `
        : ""
    }
    ${
      suggestions.featuresToTry?.length
        ? `
    <h2>Features to Try</h2>
    <div class="features-section">
      ${suggestions.featuresToTry
        .map(
          (feat) => `
        <div class="feature-card">
          <div class="feature-title">${escapeXmlAttr(feat.feature || "")}</div>
          <div class="feature-oneliner">${escapeXmlAttr(feat.oneLiner || "")}</div>
          <div class="feature-why"><strong>Why for you:</strong> ${escapeXmlAttr(feat.whyForYou || "")}</div>
          ${feat.exampleCode ? `<code class="example-code">${escapeXmlAttr(feat.exampleCode)}</code>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    `
        : ""
    }
    ${
      suggestions.usagePatterns?.length
        ? `
    <h2>New Ways to Use PI</h2>
    <div class="patterns-section">
      ${suggestions.usagePatterns
        .map(
          (pat) => `
        <div class="pattern-card">
          <div class="pattern-title">${escapeXmlAttr(pat.title || "")}</div>
          <div class="pattern-summary">${escapeXmlAttr(pat.suggestion || "")}</div>
          ${pat.detail ? `<div class="pattern-detail">${escapeXmlAttr(pat.detail)}</div>` : ""}
          ${pat.copyablePrompt ? `<code class="copyable-prompt">${escapeXmlAttr(pat.copyablePrompt)}</code>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    `
        : ""
    }
    `;
}

function renderHorizonHtml(insights: InsightResults): string {
  const horizonData = insights.onTheHorizon as
    | {
        intro?: string;
        opportunities?: Array<{
          title: string;
          whatsPossible: string;
          howToTry?: string;
          copyablePrompt?: string;
        }>;
      }
    | undefined;

  if (!horizonData?.opportunities?.length) return "";

  return `
    <h2>On the Horizon</h2>
    ${horizonData.intro ? `<p class="section-intro">${escapeXmlAttr(horizonData.intro)}</p>` : ""}
    <div class="horizon-section">
      ${horizonData.opportunities
        .map(
          (opp) => `
        <div class="horizon-card">
          <div class="horizon-title">${escapeXmlAttr(opp.title || "")}</div>
          <div class="horizon-possible">${escapeXmlAttr(opp.whatsPossible || "")}</div>
          ${opp.howToTry ? `<div class="horizon-tip"><strong>Getting started:</strong> ${escapeXmlAttr(opp.howToTry)}</div>` : ""}
          ${opp.copyablePrompt ? `<code class="copyable-prompt">${escapeXmlAttr(opp.copyablePrompt)}</code>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    `;
}

function renderFunEndingHtml(insights: InsightResults): string {
  const funEnding = insights.funEnding as { headline?: string; detail?: string } | undefined;

  if (!funEnding?.headline) return "";

  return `
    <div class="fun-ending">
      <div class="fun-headline">"${escapeXmlAttr(funEnding.headline)}"</div>
      ${funEnding.detail ? `<div class="fun-detail">${escapeXmlAttr(funEnding.detail)}</div>` : ""}
    </div>
    `;
}

function renderGoalToolChartRow(data: AggregatedData): string {
  return `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What You Wanted</div>
        ${generateBarChartHtml(data.goalCategories, "#2563eb")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Top Tools Used</div>
        ${generateBarChartHtml(data.toolCounts, "#0891b2")}
      </div>
    </div>`;
}

function renderLanguageSessionChartRow(data: AggregatedData): string {
  return `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Languages</div>
        ${generateBarChartHtml(data.languages, "#10b981")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Session Types</div>
        ${generateBarChartHtml(data.sessionTypes || {}, "#8b5cf6")}
      </div>
    </div>`;
}

function renderResponseTimeCard(data: AggregatedData): string {
  return `
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">User Response Time Distribution</div>
      ${generateResponseTimeHistogramHtml(data.userResponseTimes)}
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
        Median: ${data.medianResponseTime.toFixed(1)}s · Average: ${data.avgResponseTime.toFixed(1)}s
      </div>
    </div>`;
}

function renderMultiClaudingCard(data: AggregatedData): string {
  return `
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">Multi-PI (Parallel Sessions)</div>
      ${
        data.multiClauding.overlapEvents === 0
          ? `<p style="font-size: 14px; color: #64748b; padding: 8px 0;">No parallel session usage detected. You typically work with one PI session at a time.</p>`
          : `
        <div style="display: flex; gap: 24px; margin: 12px 0;">
          <div style="text-align: center;"><div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multiClauding.overlapEvents}</div><div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Overlap Events</div></div>
          <div style="text-align: center;"><div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multiClauding.sessionsInvolved}</div><div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Sessions Involved</div></div>
        </div>
      `
      }
    </div>`;
}

function renderTimeOfDayChartRow(data: AggregatedData): string {
  return `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title" style="display: flex; align-items: center; gap: 12px;">
          User Messages by Time of Day
          <select id="timezone-select" style="font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
            <option value="-8">PT (UTC-8)</option>
            <option value="-5">ET (UTC-5)</option>
            <option value="0">London (UTC)</option>
            <option value="1">CET (UTC+1)</option>
            <option value="9">Tokyo (UTC+9)</option>
          </select>
        </div>
        <div id="hour-histogram">${generateTimeOfDayChartHtml(data.messageHours, -8)}</div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Tool Errors Encountered</div>
        ${Object.keys(data.toolErrorCategories).length > 0 ? generateBarChartHtml(data.toolErrorCategories, "#dc2626") : emptyHtml("No tool errors")}
      </div>
    </div>`;
}

function renderOutcomeChartRow(data: AggregatedData): string {
  return `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What Helped Most</div>
        ${generateBarChartHtml(data.success, "#16a34a")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Outcomes</div>
        ${generateBarChartHtml(data.outcomes, "#8b5cf6", 6, OUTCOME_ORDER)}
      </div>
    </div>`;
}

function renderFrictionChartRow(data: AggregatedData): string {
  return `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Primary Friction Types</div>
        ${generateBarChartHtml(data.friction, "#dc2626")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Inferred Satisfaction</div>
        ${generateBarChartHtml(data.satisfaction, "#eab308", 6, SATISFACTION_ORDER)}
      </div>
    </div>`;
}

export function generateHtmlReport(data: AggregatedData, insights: InsightResults): string {
  const atAGlanceHtml = renderAtAGlanceHtml(insights);
  const projectAreasHtml = renderProjectAreasHtml(insights);
  const interactionHtml = renderInteractionHtml(insights);
  const whatWorksHtml = renderWhatWorksHtml(insights);
  const frictionHtml = renderFrictionHtml(insights);
  const suggestionsHtml = renderSuggestionsHtml(insights);
  const horizonHtml = renderHorizonHtml(insights);
  const funEndingHtml = renderFunEndingHtml(insights);
  const hourCountsJson = getHourCountsJson(data.messageHours);

  const sessionLabel =
    data.totalSessionsScanned && data.totalSessionsScanned > data.totalSessions
      ? `${data.totalSessionsScanned.toLocaleString()} sessions total \u00b7 ${data.totalSessions} analyzed`
      : `${data.totalSessions} sessions`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PI Insights</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="container">
    <h1>PI Insights</h1>
    <p class="subtitle">${data.totalMessages.toLocaleString()} messages across ${sessionLabel} | ${data.dateRange.start} to ${data.dateRange.end}</p>

    ${atAGlanceHtml}

    <div class="stats-row">
      <div class="stat"><div class="stat-value">${data.totalMessages.toLocaleString()}</div><div class="stat-label">Messages</div></div>
      <div class="stat"><div class="stat-value">+${data.totalLinesAdded.toLocaleString()}/-${data.totalLinesRemoved.toLocaleString()}</div><div class="stat-label">Lines</div></div>
      <div class="stat"><div class="stat-value">${data.totalFilesModified}</div><div class="stat-label">Files</div></div>
      <div class="stat"><div class="stat-value">${data.daysActive}</div><div class="stat-label">Days</div></div>
      <div class="stat"><div class="stat-value">${data.messagesPerDay}</div><div class="stat-label">Msgs/Day</div></div>
    </div>

    ${projectAreasHtml}

    ${renderGoalToolChartRow(data)}
    ${renderLanguageSessionChartRow(data)}

    ${interactionHtml}

    ${renderResponseTimeCard(data)}
    ${renderMultiClaudingCard(data)}
    ${renderTimeOfDayChartRow(data)}

    ${whatWorksHtml}

    ${renderOutcomeChartRow(data)}

    ${frictionHtml}

    ${renderFrictionChartRow(data)}

    ${suggestionsHtml}
    ${horizonHtml}
    ${funEndingHtml}
  </div>
  <script>${generateReportJs(hourCountsJson)}</script>
</body>
</html>`;
}

function markdownToHtml(md: string): string {
  if (!md) return "";
  return md
    .split("\n\n")
    .map((p) => {
      let html = escapeXmlAttr(p);
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/^- /gm, "• ");
      html = html.replace(/\n/g, "<br>");
      return `<p>${html}</p>`;
    })
    .join("\n");
}
