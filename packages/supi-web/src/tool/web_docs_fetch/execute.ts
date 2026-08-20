import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getContext } from "../../context7-client.ts";
import { limitModelVisibleOutput } from "../result.ts";
import { buildFetchResult, type FetchDetails } from "./result.ts";
import type { WebDocsFetchInput } from "./spec.ts";

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
export async function runFetch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  _ctx: ExtensionContext,
): Promise<AgentToolResult<FetchDetails>> {
  const input = (params ?? {}) as WebDocsFetchInput;
  const libraryId = input.library_id?.trim();
  const query = input.query?.trim();
  const raw = Boolean(input.raw);

  if (!libraryId) throw new Error("'library_id' parameter is required");
  if (!query) throw new Error("'query' parameter is required");

  onUpdate?.({
    content: [{ type: "text", text: `Fetching Context7 docs for ${libraryId}...` }],
    details: { libraryId, raw },
  });

  const requestOptions = signal ? { signal } : undefined;
  const content = await getContext(query, libraryId, raw, requestOptions);
  const textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const output = await limitModelVisibleOutput(textContent, {
    tempPrefix: "web-docs-fetch",
    suffix: raw ? ".json" : ".md",
  });

  return buildFetchResult(libraryId, raw, textContent, output);
}
