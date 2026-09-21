import { isValidIsoDate } from "./input.ts";

/** One source returned by the Web Search context response. */
export interface WebSearchSource {
  title: string;
  url: string;
  excerpts: string[];
  sourceDate?: string;
}

/** Parsed source data used by the Web Search result assembler. */
export interface ParsedWebSearchResponse {
  sources: WebSearchSource[];
}

/** Validate the required bx response envelope and keep only source data. */
export function parseBxResponse(payload: unknown): ParsedWebSearchResponse {
  const root = asRecord(payload);
  const grounding = asRecord(root?.grounding);
  if (!grounding || !Array.isArray(grounding.generic)) {
    throw new Error("bx returned malformed web search data: grounding.generic is required.");
  }

  const sources = grounding.generic.map((value, index) =>
    parseSource(value, index, findSourceDate(root, value)),
  );
  return { sources };
}

function parseSource(
  value: unknown,
  index: number,
  sourceDate: string | undefined,
): WebSearchSource {
  const source = asRecord(value);
  if (!source) throw new Error(`bx returned malformed web search source at index ${index}.`);

  const title = requiredText(source.title, "title", index);
  const url = requiredText(source.url, "url", index);
  if (!Array.isArray(source.snippets)) {
    throw new Error(
      `bx returned malformed web search source at index ${index}: snippets is required.`,
    );
  }

  return {
    title,
    url,
    excerpts: source.snippets.map((snippet, snippetIndex) =>
      parseSnippet(snippet, index, snippetIndex),
    ),
    ...(sourceDate ? { sourceDate } : {}),
  };
}

function requiredText(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `bx returned malformed web search source at index ${index}: ${field} is required.`,
    );
  }
  return value.trim();
}

function parseSnippet(value: unknown, sourceIndex: number, snippetIndex: number): string {
  if (typeof value === "string") return value;

  throw new Error(
    `bx returned malformed web search snippet at source ${sourceIndex}, index ${snippetIndex}.`,
  );
}

function findSourceDate(root: Record<string, unknown> | null, source: unknown): string | undefined {
  const sourceRecord = asRecord(source);
  const url = typeof sourceRecord?.url === "string" ? sourceRecord.url : undefined;
  const sources = asRecord(root?.sources);
  const metadata = url ? asRecord(sources?.[url]) : null;
  return findSafeDate(metadata?.age);
}

function findSafeDate(value: unknown): string | undefined {
  if (typeof value === "string") return isValidIsoDate(value) ? value : undefined;
  if (!Array.isArray(value)) return undefined;

  return value.find((item): item is string => typeof item === "string" && isValidIsoDate(item));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
