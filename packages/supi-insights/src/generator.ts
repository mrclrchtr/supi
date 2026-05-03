// Insight generator — produce narrative insights from aggregated data via LLM calls.

import { complete, getModel } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AggregatedData, InsightResults, SessionFacets } from "./types.ts";

type InsightSection = {
  name: keyof InsightResults;
  prompt: string;
  maxTokens: number;
};

const INSIGHT_SECTIONS: InsightSection[] = [
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
    maxTokens: 2048,
  },
];

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
    if (result) {
      insights[name] = result;
    }
  }

  // Generate at_a_glance sequentially (needs other sections)
  const atAGlance = await generateAtAGlance(data, insights, dataContext, ctx);
  if (atAGlance) {
    insights.atAGlance = atAGlance;
  }

  return insights;
}

async function generateSectionInsight(
  section: InsightSection,
  dataContext: string,
  ctx: ExtensionContext,
): Promise<{ name: keyof InsightResults; result: unknown }> {
  try {
    const model = getModel("anthropic", "claude-sonnet-4-5");
    if (!model) return { name: section.name, result: null };

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return { name: section.name, result: null };

    const response = await complete(
      model,
      {
        systemPrompt: "",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${section.prompt}\n\nDATA:\n${dataContext}` }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: ctx.signal,
        maxTokens: section.maxTokens,
      },
    );

    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { name: section.name, result: null };

    try {
      return { name: section.name, result: JSON.parse(jsonMatch[0]) };
    } catch {
      return { name: section.name, result: null };
    }
  } catch {
    return { name: section.name, result: null };
  }
}

async function generateAtAGlance(
  _data: AggregatedData,
  insights: InsightResults,
  dataContext: string,
  ctx: ExtensionContext,
): Promise<unknown> {
  const projectAreasText =
    (
      insights.projectAreas as {
        areas?: Array<{ name: string; description: string }>;
      }
    )?.areas
      ?.map((a) => `- ${a.name}: ${a.description}`)
      .join("\n") || "";

  const bigWinsText =
    (
      insights.whatWorks as {
        impressiveWorkflows?: Array<{ title: string; description: string }>;
      }
    )?.impressiveWorkflows
      ?.map((w) => `- ${w.title}: ${w.description}`)
      .join("\n") || "";

  const frictionText =
    (
      insights.frictionAnalysis as {
        categories?: Array<{ category: string; description: string }>;
      }
    )?.categories
      ?.map((c) => `- ${c.category}: ${c.description}`)
      .join("\n") || "";

  const featuresText =
    (
      insights.suggestions as {
        featuresToTry?: Array<{ feature: string; oneLiner: string }>;
      }
    )?.featuresToTry
      ?.map((f) => `- ${f.feature}: ${f.oneLiner}`)
      .join("\n") || "";

  const horizonText =
    (
      insights.onTheHorizon as {
        opportunities?: Array<{ title: string; whatsPossible: string }>;
      }
    )?.opportunities
      ?.map((o) => `- ${o.title}: ${o.whatsPossible}`)
      .join("\n") || "";

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

  try {
    const model = getModel("anthropic", "claude-sonnet-4-5");
    if (!model) return null;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return null;

    const response = await complete(
      model,
      {
        systemPrompt: "",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: ctx.signal,
        maxTokens: 4096,
      },
    );

    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

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
