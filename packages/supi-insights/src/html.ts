// HTML report renderer — generate a shareable HTML insights report.

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: report rendering intentionally assembles many optional sections.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: keeping the HTML template together preserves report structure readability.
export function generateHtmlReport(data: AggregatedData, insights: InsightResults): string {
  const atAGlance = insights.atAGlance as
    | {
        whatsWorking?: string;
        whatsHindering?: string;
        quickWins?: string;
        ambitiousWorkflows?: string;
      }
    | undefined;

  const atAGlanceHtml = atAGlance
    ? `
    <div class="at-a-glance">
      <div class="glance-title">At a Glance</div>
      <div class="glance-sections">
        ${atAGlance.whatsWorking ? `<div class="glance-section"><strong>What's working:</strong> ${escapeHtmlWithBold(atAGlance.whatsWorking)}</div>` : ""}
        ${atAGlance.whatsHindering ? `<div class="glance-section"><strong>What's hindering you:</strong> ${escapeHtmlWithBold(atAGlance.whatsHindering)}</div>` : ""}
        ${atAGlance.quickWins ? `<div class="glance-section"><strong>Quick wins to try:</strong> ${escapeHtmlWithBold(atAGlance.quickWins)}</div>` : ""}
        ${atAGlance.ambitiousWorkflows ? `<div class="glance-section"><strong>Ambitious workflows:</strong> ${escapeHtmlWithBold(atAGlance.ambitiousWorkflows)}</div>` : ""}
      </div>
    </div>
    `
    : "";

  const projectAreas =
    (
      insights.projectAreas as
        | { areas?: Array<{ name: string; sessionCount: number; description: string }> }
        | undefined
    )?.areas || [];
  const projectAreasHtml =
    projectAreas.length > 0
      ? `
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
    `
      : "";

  const interactionStyle = insights.interactionStyle as
    | { narrative?: string; keyPattern?: string }
    | undefined;
  const interactionHtml = interactionStyle?.narrative
    ? `
    <h2>How You Use PI</h2>
    <div class="narrative">
      ${markdownToHtml(interactionStyle.narrative)}
      ${interactionStyle.keyPattern ? `<div class="key-insight"><strong>Key pattern:</strong> ${escapeXmlAttr(interactionStyle.keyPattern)}</div>` : ""}
    </div>
    `
    : "";

  const whatWorks = insights.whatWorks as
    | { intro?: string; impressiveWorkflows?: Array<{ title: string; description: string }> }
    | undefined;
  const whatWorksHtml =
    whatWorks?.impressiveWorkflows && whatWorks.impressiveWorkflows.length > 0
      ? `
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
    `
      : "";

  const frictionAnalysis = insights.frictionAnalysis as
    | {
        intro?: string;
        categories?: Array<{ category: string; description: string; examples?: string[] }>;
      }
    | undefined;
  const frictionHtml =
    frictionAnalysis?.categories && frictionAnalysis.categories.length > 0
      ? `
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
    `
      : "";

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

  const suggestionsHtml = suggestions
    ? `
    ${
      suggestions.claudeMdAdditions && suggestions.claudeMdAdditions.length > 0
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
      suggestions.featuresToTry && suggestions.featuresToTry.length > 0
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
      suggestions.usagePatterns && suggestions.usagePatterns.length > 0
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
    `
    : "";

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
  const horizonHtml =
    horizonData?.opportunities && horizonData.opportunities.length > 0
      ? `
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
    `
      : "";

  const funEnding = insights.funEnding as { headline?: string; detail?: string } | undefined;
  const funEndingHtml = funEnding?.headline
    ? `
    <div class="fun-ending">
      <div class="fun-headline">"${escapeXmlAttr(funEnding.headline)}"</div>
      ${funEnding.detail ? `<div class="fun-detail">${escapeXmlAttr(funEnding.detail)}</div>` : ""}
    </div>
    `
    : "";

  const hourCountsJson = getHourCountsJson(data.messageHours);

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #334155; line-height: 1.65; padding: 48px 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 32px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 48px; margin-bottom: 16px; }
    .subtitle { color: #64748b; font-size: 15px; margin-bottom: 32px; }
    .stats-row { display: flex; gap: 24px; margin-bottom: 40px; padding: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .at-a-glance { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; }
    .glance-title { font-size: 16px; font-weight: 700; color: #92400e; margin-bottom: 16px; }
    .glance-sections { display: flex; flex-direction: column; gap: 12px; }
    .glance-section { font-size: 14px; color: #78350f; line-height: 1.6; }
    .glance-section strong { color: #92400e; }
    .project-areas { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
    .project-area { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .area-name { font-weight: 600; font-size: 15px; color: #0f172a; }
    .area-count { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
    .area-desc { font-size: 14px; color: #475569; line-height: 1.5; }
    .narrative { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .narrative p { margin-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.7; }
    .key-insight { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 12px; font-size: 14px; color: #166534; }
    .section-intro { font-size: 14px; color: #64748b; margin-bottom: 16px; }
    .big-wins { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .big-win { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; }
    .big-win-title { font-weight: 600; font-size: 15px; color: #166534; margin-bottom: 8px; }
    .big-win-desc { font-size: 14px; color: #15803d; line-height: 1.5; }
    .friction-categories { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    .friction-category { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; }
    .friction-title { font-weight: 600; font-size: 15px; color: #991b1b; margin-bottom: 6px; }
    .friction-desc { font-size: 13px; color: #7f1d1d; margin-bottom: 10px; }
    .friction-examples { margin: 0 0 0 20px; font-size: 13px; color: #334155; }
    .friction-examples li { margin-bottom: 4px; }
    .claude-md-section { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .claude-md-item { padding: 10px 0; border-bottom: 1px solid #dbeafe; }
    .claude-md-item:last-child { border-bottom: none; }
    .cmd-code { background: white; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #1e40af; border: 1px solid #bfdbfe; font-family: monospace; display: block; white-space: pre-wrap; word-break: break-word; }
    .cmd-why { font-size: 12px; color: #64748b; margin-top: 4px; }
    .features-section, .patterns-section { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
    .feature-card { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; }
    .pattern-card { background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 16px; }
    .feature-title, .pattern-title { font-weight: 600; font-size: 15px; color: #0f172a; margin-bottom: 6px; }
    .feature-oneliner { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .pattern-summary { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .feature-why, .pattern-detail { font-size: 13px; color: #334155; line-height: 1.5; }
    .example-code, .copyable-prompt { display: block; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #334155; margin-top: 8px; white-space: pre-wrap; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .chart-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .chart-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 12px; }
    .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
    .bar-label { width: 120px; font-size: 11px; color: #475569; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; margin: 0 8px; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .bar-value { width: 28px; font-size: 11px; font-weight: 500; color: #64748b; text-align: right; }
    .empty { color: #94a3b8; font-size: 13px; }
    .horizon-section { display: flex; flex-direction: column; gap: 16px; }
    .horizon-card { background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%); border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px; }
    .horizon-title { font-weight: 600; font-size: 15px; color: #5b21b6; margin-bottom: 8px; }
    .horizon-possible { font-size: 14px; color: #334155; margin-bottom: 10px; line-height: 1.5; }
    .horizon-tip { font-size: 13px; color: #6b21a8; background: rgba(255,255,255,0.6); padding: 8px 12px; border-radius: 4px; }
    .fun-ending { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #fbbf24; border-radius: 12px; padding: 24px; margin-top: 40px; text-align: center; }
    .fun-headline { font-size: 18px; font-weight: 600; color: #78350f; margin-bottom: 8px; }
    .fun-detail { font-size: 14px; color: #92400e; }
    @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .stats-row { justify-content: center; } }
  `;

  const js = `
    const rawHourCounts = ${hourCountsJson};
    function updateHourHistogram(utcOffset) {
      const periods = [
        { label: "Morning (6-12)", range: [6,7,8,9,10,11] },
        { label: "Afternoon (12-18)", range: [12,13,14,15,16,17] },
        { label: "Evening (18-24)", range: [18,19,20,21,22,23] },
        { label: "Night (0-6)", range: [0,1,2,3,4,5] }
      ];
      const adjustedCounts = {};
      for (const [hour, count] of Object.entries(rawHourCounts)) {
        const newHour = (parseInt(hour) + utcOffset + 24) % 24;
        adjustedCounts[newHour] = (adjustedCounts[newHour] || 0) + count;
      }
      const periodCounts = periods.map(p => ({
        label: p.label,
        count: p.range.reduce((sum, h) => sum + (adjustedCounts[h] || 0), 0)
      }));
      const maxCount = Math.max(...periodCounts.map(p => p.count)) || 1;
      const container = document.getElementById('hour-histogram');
      if (!container) return;
      container.innerHTML = periodCounts.map(p => \`
        <div class="bar-row">
          <div class="bar-label">\${p.label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:\${(p.count / maxCount) * 100}%;background:#8b5cf6"></div></div>
          <div class="bar-value">\${p.count}</div>
        </div>
      \`).join('');
    }
    document.getElementById('timezone-select')?.addEventListener('change', function() {
      updateHourHistogram(parseInt(this.value));
    });
  `;

  const sessionLabel =
    data.totalSessionsScanned && data.totalSessionsScanned > data.totalSessions
      ? `${data.totalSessionsScanned.toLocaleString()} sessions total · ${data.totalSessions} analyzed`
      : `${data.totalSessions} sessions`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PI Insights</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
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

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What You Wanted</div>
        ${generateBarChartHtml(data.goalCategories, "#2563eb")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Top Tools Used</div>
        ${generateBarChartHtml(data.toolCounts, "#0891b2")}
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Languages</div>
        ${generateBarChartHtml(data.languages, "#10b981")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Session Types</div>
        ${generateBarChartHtml(data.sessionTypes || {}, "#8b5cf6")}
      </div>
    </div>

    ${interactionHtml}

    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">User Response Time Distribution</div>
      ${generateResponseTimeHistogramHtml(data.userResponseTimes)}
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
        Median: ${data.medianResponseTime.toFixed(1)}s · Average: ${data.avgResponseTime.toFixed(1)}s
      </div>
    </div>

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
    </div>

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
    </div>

    ${whatWorksHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What Helped Most</div>
        ${generateBarChartHtml(data.success, "#16a34a")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Outcomes</div>
        ${generateBarChartHtml(data.outcomes, "#8b5cf6", 6, OUTCOME_ORDER)}
      </div>
    </div>

    ${frictionHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Primary Friction Types</div>
        ${generateBarChartHtml(data.friction, "#dc2626")}
      </div>
      <div class="chart-card">
        <div class="chart-title">Inferred Satisfaction</div>
        ${generateBarChartHtml(data.satisfaction, "#eab308", 6, SATISFACTION_ORDER)}
      </div>
    </div>

    ${suggestionsHtml}
    ${horizonHtml}
    ${funEndingHtml}
  </div>
  <script>${js}</script>
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
