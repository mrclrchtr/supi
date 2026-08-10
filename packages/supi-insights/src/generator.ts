// Insight generator — produce narrative insights from aggregated data via LLM calls.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { callWithJsonResponse } from "@mrclrchtr/supi-core/llm";
import {
  INSIGHT_SCHEMAS,
  type InsightResultMap,
  type InsightSchemaMap,
} from "./insight-schemas.ts";
import type { AggregatedData, InsightResults, SessionFacets } from "./types.ts";

// ── Section definitions ──────────────────────────────────────────────────

type ParallelInsightSectionName = Exclude<keyof InsightResultMap, "atAGlance">;

type InsightSection<Name extends ParallelInsightSectionName> = {
  name: Name;
  prompt: string;
  schema: InsightSchemaMap[Name];
  maxTokens: number;
};

type ParallelInsightSection = {
  [Name in ParallelInsightSectionName]: InsightSection<Name>;
}[ParallelInsightSectionName];

const INSIGHT_SECTIONS = [
  {
    name: "projectAreas",
    prompt: `Analyze this PI usage data and identify project areas.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "areas": [
    {"name": "Area name", "sessionCount": N, "description": "2-3 sentences about what was worked on and how PI was used."}
  ]
}

Include 4-5 areas.`,
    schema: INSIGHT_SCHEMAS.projectAreas,
    maxTokens: 4096,
  },
  {
    name: "interactionStyle",
    prompt: `Analyze this PI usage data and describe the user's interaction style.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "narrative": "2-3 paragraphs analyzing HOW the user interacts with PI. Use second person 'you'. Describe patterns: iterate quickly vs detailed upfront specs? Interrupt often or let the agent run? Include specific examples. Use **bold** for key insights.",
  "keyPattern": "One sentence summary of most distinctive interaction style"
}`,
    schema: INSIGHT_SCHEMAS.interactionStyle,
    maxTokens: 4096,
  },
  {
    name: "whatWorks",
    prompt: `Analyze this PI usage data and identify what's working well for this user. Use second person ("you").

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence of context",
  "impressiveWorkflows": [
    {"title": "Short title (3-6 words)", "description": "2-3 sentences describing the impressive workflow or approach. Use 'you' not 'the user'."}
  ]
}

Include 3 impressive workflows.`,
    schema: INSIGHT_SCHEMAS.whatWorks,
    maxTokens: 4096,
  },
  {
    name: "frictionAnalysis",
    prompt: `Analyze this PI usage data and identify friction points for this user. Use second person ("you").

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence summarizing friction patterns",
  "categories": [
    {"category": "Concrete category name", "description": "1-2 sentences explaining this category and what could be done differently. Use 'you' not 'the user'.", "examples": ["Specific example with consequence", "Another example"]}
  ]
}

Include 3 friction categories with 2 examples each.`,
    schema: INSIGHT_SCHEMAS.frictionAnalysis,
    maxTokens: 4096,
  },
  {
    name: "suggestions",
    prompt: `Analyze this PI usage data and suggest improvements.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "claudeMdAdditions": [
    {"addition": "A specific line or block to add to CLAUDE.md based on workflow patterns.", "why": "1 sentence explaining why this would help based on actual sessions", "promptScaffold": "Instructions for where to add this in CLAUDE.md"}
  ],
  "featuresToTry": [
    {"feature": "Feature name", "oneLiner": "What it does", "whyForYou": "Why this would help YOU based on your sessions", "exampleCode": "Actual command or config to copy"}
  ],
  "usagePatterns": [
    {"title": "Short title", "suggestion": "1-2 sentence summary", "detail": "3-4 sentences explaining how this applies to YOUR work", "copyablePrompt": "A specific prompt to copy and try"}
  ]
}

IMPORTANT: PRIORITIZE instructions that appear MULTIPLE TIMES in the user data.`,
    schema: INSIGHT_SCHEMAS.suggestions,
    maxTokens: 4096,
  },
  {
    name: "onTheHorizon",
    prompt: `Analyze this PI usage data and identify future opportunities.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence about evolving AI-assisted development",
  "opportunities": [
    {"title": "Short title (4-8 words)", "whatsPossible": "2-3 ambitious sentences about autonomous workflows", "howToTry": "1-2 sentences mentioning relevant tooling", "copyablePrompt": "Detailed prompt to try"}
  ]
}

Include 3 opportunities. Think BIG - autonomous workflows, parallel agents, iterating against tests.`,
    schema: INSIGHT_SCHEMAS.onTheHorizon,
    maxTokens: 4096,
  },
  {
    name: "funEnding",
    prompt: `Analyze this PI usage data and find a memorable moment.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "headline": "A memorable QUALITATIVE moment from the transcripts - not a statistic. Something human, funny, or surprising.",
  "detail": "Brief context about when/where this happened"
}

Find something genuinely interesting or amusing from the session summaries.`,
    schema: INSIGHT_SCHEMAS.funEnding,
    maxTokens: 2048,
  },
] satisfies readonly ParallelInsightSection[];

// ── Public API ─────────────────────────────────────────────────────────────

export async function generateInsights(
  data: AggregatedData,
  facets: Map<string, SessionFacets>,
  ctx: ExtensionContext,
): Promise<InsightResults> {
  const dataContext = buildDataContext(data, facets);

  // Run sections in parallel
  const results = await Promise.all(
    INSIGHT_SECTIONS.map((section) => generateSectionInsight(section, dataContext, ctx)),
  );

  const insights: InsightResults = {};
  for (const { name, result } of results) {
    if (result) Object.assign(insights, { [name]: result });
  }

  // Generate at_a_glance sequentially (needs other sections)
  const atAGlance = await generateAtAGlance(insights, dataContext, ctx);
  if (atAGlance) {
    insights.atAGlance = atAGlance;
  }

  return insights;
}

// ── Section generators ────────────────────────────────────────────────────

async function generateSectionInsight<Name extends ParallelInsightSectionName>(
  section: InsightSection<Name>,
  dataContext: string,
  ctx: ExtensionContext,
) {
  const result = await callWithJsonResponse(
    ctx,
    {
      prompt: section.prompt,
      dataContext,
      maxTokens: section.maxTokens,
      retries: 2,
    },
    section.schema,
  );

  return { name: section.name, result: result?.parsed ?? null };
}

async function generateAtAGlance(
  insights: InsightResults,
  dataContext: string,
  ctx: ExtensionContext,
): Promise<InsightResultMap["atAGlance"] | null> {
  const projectAreasText =
    insights.projectAreas?.areas.map((area) => `- ${area.name}: ${area.description}`).join("\n") ??
    "";

  const bigWinsText =
    insights.whatWorks?.impressiveWorkflows
      .map((workflow) => `- ${workflow.title}: ${workflow.description}`)
      .join("\n") ?? "";

  const frictionText =
    insights.frictionAnalysis?.categories
      .map((category) => `- ${category.category}: ${category.description}`)
      .join("\n") ?? "";

  const featuresText =
    insights.suggestions?.featuresToTry
      .map((feature) => `- ${feature.feature}: ${feature.oneLiner}`)
      .join("\n") ?? "";

  const horizonText =
    insights.onTheHorizon?.opportunities
      .map((opportunity) => `- ${opportunity.title}: ${opportunity.whatsPossible}`)
      .join("\n") ?? "";

  const prompt = `You're writing an "At a Glance" summary for a PI usage insights report.

Use this 4-part structure:

1. **What's working** - What is the user's unique style of interacting with PI and what are some impactful things they've done?

2. **What's hindering you** - Split into (a) the agent's fault and (b) user-side friction.

3. **Quick wins to try** - Specific features or workflow techniques.

4. **Ambitious workflows for better models** - As models improve, what workflows should they prepare for?

Keep each section to 2-3 sentences. Use a coaching tone.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "whatsWorking": "...",
  "whatsHindering": "...",
  "quickWins": "...",
  "ambitiousWorkflows": "..."
}

SESSION DATA:
${dataContext}

## Project Areas
${projectAreasText}

## Big Wins
${bigWinsText}

## Friction Categories
${frictionText}

## Features to Try
${featuresText}

## On the Horizon
${horizonText}`;

  const result = await callWithJsonResponse(
    ctx,
    {
      prompt,
      maxTokens: 4096,
      retries: 2,
    },
    INSIGHT_SCHEMAS.atAGlance,
  );

  return result?.parsed ?? null;
}

// ── Data context ──────────────────────────────────────────────────────────

function buildDataContext(data: AggregatedData, facets: Map<string, SessionFacets>): string {
  const facetSummaries = Array.from(facets.values())
    .slice(0, 50)
    .map((f) => `- ${f.briefSummary} (${f.outcome}, ${f.claudeHelpfulness})`)
    .join("\n");

  const frictionDetails = Array.from(facets.values())
    .filter((f) => f.frictionDetail)
    .slice(0, 20)
    .map((f) => `- ${f.frictionDetail}`)
    .join("\n");

  return (
    JSON.stringify(
      {
        sessions: data.totalSessions,
        analyzed: data.sessionsWithFacets,
        dateRange: data.dateRange,
        messages: data.totalMessages,
        hours: Math.round(data.totalDurationHours),
        commits: data.gitCommits,
        topTools: Object.entries(data.toolCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
        topGoals: Object.entries(data.goalCategories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
        outcomes: data.outcomes,
        satisfaction: data.satisfaction,
        friction: data.friction,
        success: data.success,
        languages: data.languages,
      },
      null,
      2,
    ) +
    "\n\nSESSION SUMMARIES:\n" +
    facetSummaries +
    "\n\nFRICTION DETAILS:\n" +
    frictionDetails
  );
}
