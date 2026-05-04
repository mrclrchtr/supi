// LLM facet extraction — analyze session transcripts and extract structured facets.

import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SessionFacets } from "./types.ts";
import { withRetry } from "./utils.ts";

const FACET_EXTRACTION_PROMPT = `Analyze this PI coding agent session and extract structured facets.

CRITICAL GUIDELINES:

1. **goalCategories**: Count ONLY what the USER explicitly asked for.
   - DO NOT count the agent's autonomous codebase exploration
   - DO NOT count work the agent decided to do on its own
   - ONLY count when user says "can you...", "please...", "I need...", "let's..."

2. **userSatisfactionCounts**: Base ONLY on explicit user signals.
   - "Yay!", "great!", "perfect!" → happy
   - "thanks", "looks good", "that works" → satisfied
   - "ok, now let's..." (continuing without complaint) → likely_satisfied
   - "that's not right", "try again" → dissatisfied
   - "this is broken", "I give up" → frustrated

3. **frictionCounts**: Be specific about what went wrong.
   - misunderstood_request: Agent interpreted incorrectly
   - wrong_approach: Right goal, wrong solution method
   - buggy_code: Code didn't work correctly
   - user_rejected_action: User said no/stop to a tool call
   - excessive_changes: Over-engineered or changed too much

4. If very short or just warmup, use warmup_minimal for goal_category

SESSION:
`;

const SUMMARIZE_CHUNK_PROMPT = `Summarize this portion of a PI session transcript. Focus on:
1. What the user asked for
2. What the agent did (tools used, files modified)
3. Any friction or issues
4. The outcome

Keep it concise - 3-5 sentences. Preserve specific details like file names, error messages, and user feedback.

TRANSCRIPT CHUNK:
`;

export async function extractFacets(
  transcript: string,
  sessionId: string,
  ctx: ExtensionContext,
): Promise<SessionFacets | null> {
  // Resolve model: prefer active model, fall back to any available configured model
  const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  // For long transcripts, summarize in chunks first
  const processedTranscript =
    transcript.length > 30000 ? await summarizeTranscript(transcript, ctx) : transcript;

  const jsonPrompt = `${FACET_EXTRACTION_PROMPT}${processedTranscript}

RESPOND WITH ONLY A VALID JSON OBJECT matching this schema:
{
  "underlyingGoal": "What the user fundamentally wanted to achieve",
  "goalCategories": {"category_name": count, ...},
  "outcome": "fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear_from_transcript",
  "userSatisfactionCounts": {"level": count, ...},
  "claudeHelpfulness": "unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
  "sessionType": "single_task|multi_task|iterative_refinement|exploration|quick_question",
  "frictionCounts": {"friction_type": count, ...},
  "frictionDetail": "One sentence describing friction or empty",
  "primarySuccess": "none|fast_accurate_search|correct_code_edits|good_explanations|proactive_help|multi_file_changes|good_debugging",
  "briefSummary": "One sentence: what user wanted and whether they got it"
}`;

  // Attempt the LLM call with up to 2 retries
  const response = await withRetry(
    async () => {
      const res = await complete(
        model,
        {
          systemPrompt: "",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: jsonPrompt }],
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
      return res;
    },
    2,
    1000,
  );

  if (!response) return null;

  try {
    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!isValidSessionFacets(parsed)) return null;

    return { ...parsed, sessionId };
  } catch {
    return null;
  }
}

async function summarizeTranscript(transcript: string, ctx: ExtensionContext): Promise<string> {
  const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
  if (!model) return transcript.slice(0, 30000);

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return transcript.slice(0, 30000);

  const CHUNK_SIZE = 25000;
  const chunks: string[] = [];
  for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
    chunks.push(transcript.slice(i, i + CHUNK_SIZE));
  }

  const summaries = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await complete(
          model,
          {
            systemPrompt: "",
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: SUMMARIZE_CHUNK_PROMPT + chunk }],
                timestamp: Date.now(),
              },
            ],
          },
          {
            apiKey: auth.apiKey,
            headers: auth.headers,
            signal: ctx.signal,
            maxTokens: 500,
          },
        );
        return response.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");
      } catch {
        return chunk.slice(0, 2000);
      }
    }),
  );

  return summaries.join("\n\n---\n\n");
}

function isValidSessionFacets(obj: unknown): obj is Omit<SessionFacets, "sessionId"> {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.underlyingGoal === "string" &&
    typeof o.outcome === "string" &&
    typeof o.briefSummary === "string" &&
    o.goalCategories !== null &&
    typeof o.goalCategories === "object" &&
    o.userSatisfactionCounts !== null &&
    typeof o.userSatisfactionCounts === "object" &&
    o.frictionCounts !== null &&
    typeof o.frictionCounts === "object"
  );
}
