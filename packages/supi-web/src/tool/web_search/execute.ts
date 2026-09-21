import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { limitModelVisibleOutput } from "../result.ts";
import { runBxContext } from "./bx.ts";
import { validateWebSearchInput } from "./input.ts";
import { parseBxResponse } from "./parse.ts";
import { buildSearchResult, formatSearchResults, type WebSearchDetails } from "./result.ts";

/** Execute one direct bx context search. */
// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
export async function runWebSearch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<WebSearchDetails>> {
  const input = validateWebSearchInput(params);
  onUpdate?.({
    content: [{ type: "text", text: "Searching the web..." }],
    details: { status: "searching" },
  });

  const payload = await runBxContext(input.query, input.freshness, {
    cwd: ctx.cwd,
    ...(signal ? { signal } : {}),
  });
  const parsed = parseBxResponse(payload);
  const markdown = formatSearchResults(parsed.sources);
  const output = await limitModelVisibleOutput(markdown, {
    tempPrefix: "web-search",
    suffix: ".md",
  });

  return buildSearchResult(parsed.sources, output);
}
