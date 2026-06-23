import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, type TSchema, Type } from "typebox";
import { MODEL_OUTPUT_LIMIT_DESCRIPTION } from "./output.ts";

export const WEB_FETCH_MD_TOOL_NAME = "web_fetch_md";
export const WEB_DOCS_SEARCH_TOOL_NAME = "web_docs_search";
export const WEB_DOCS_FETCH_TOOL_NAME = "web_docs_fetch";

export const WEB_TOOL_NAMES = [
  WEB_FETCH_MD_TOOL_NAME,
  WEB_DOCS_SEARCH_TOOL_NAME,
  WEB_DOCS_FETCH_TOOL_NAME,
] as const;
export type WebToolName = (typeof WEB_TOOL_NAMES)[number];

export const WEB_FETCH_INLINE_MAX_CHARS = 15_000;
export const WEB_FETCH_OUTPUT_MODES = ["auto", "inline", "file"] as const;
export type WebFetchOutputMode = (typeof WEB_FETCH_OUTPUT_MODES)[number];

const OutputModeEnum = StringEnum(WEB_FETCH_OUTPUT_MODES, {
  default: "auto",
  description: "Output mode: auto, inline, or file",
});

const WebFetchMdParameters = Type.Object(
  {
    url: Type.String({ description: "Public http(s) URL to fetch" }),
    output_mode: Type.Optional(OutputModeEnum),
    abs_links: Type.Optional(
      Type.Boolean({ description: "Absolutize relative links/images", default: true }),
    ),
    timeout_ms: Type.Optional(
      Type.Number({ description: "Per-request fetch timeout in milliseconds", default: 30_000 }),
    ),
  },
  { additionalProperties: false },
);

const WebDocsSearchParameters = Type.Object(
  {
    library_name: Type.String({
      description: "Library name to search for (e.g. react, next.js, fastapi)",
    }),
    query: Type.String({
      description: "What you're trying to do — used for relevance ranking of results",
    }),
  },
  { additionalProperties: false },
);

const WebDocsFetchParameters = Type.Object(
  {
    library_id: Type.String({
      description:
        "Context7 library ID (e.g. /facebook/react, /vercel/next.js). Find it via web_docs_search.",
    }),
    query: Type.String({ description: "Specific question about the library" }),
    raw: Type.Optional(
      Type.Boolean({
        description:
          "When true, returns JSON-serialized snippet objects instead of plain text Markdown",
        default: false,
      }),
    ),
  },
  { additionalProperties: false },
);

export type WebFetchMdInput = Static<typeof WebFetchMdParameters>;
export type WebDocsSearchInput = Static<typeof WebDocsSearchParameters>;
export type WebDocsFetchInput = Static<typeof WebDocsFetchParameters>;

export interface WebToolSpec {
  name: WebToolName;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: readonly string[];
  parameters: TSchema;
}

export const WEB_TOOL_SPECS = [
  {
    name: WEB_FETCH_MD_TOOL_NAME,
    label: "Web Fetch",
    description: `Fetch a public web page and convert it to Markdown. Use only for public http:// or https:// URLs; reject private or access-controlled pages and ask for an allowed source instead.

Output modes:
- auto (default): inline up to ${WEB_FETCH_INLINE_MAX_CHARS.toLocaleString()} chars, otherwise return a temp file path
- inline: return Markdown inline, subject to model-visible truncation
- file: always return a temp file path

Links and images default to absolute; use abs_links: false to keep relative paths. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_fetch_md — fetch a public URL as Markdown",
    promptGuidelines: [
      "Use web_fetch_md only for public `http://` or `https://` pages; if a page is private or access-controlled, ask for an allowed source.",
      "Use web_fetch_md with `output_mode: auto` by default; use `inline` for in-context Markdown and `file` for a temp path.",
      "Use web_fetch_md with `abs_links: false` only when you want relative links or images.",
    ],
    parameters: WebFetchMdParameters,
  },
  {
    name: WEB_DOCS_SEARCH_TOOL_NAME,
    label: "Web Docs Search",
    description: `Search Context7 for library IDs before fetching docs. Returns a Markdown table of matching libraries and metadata. Valid empty searches return a not-found message; API and network failures are tool errors. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_docs_search — find Context7 library IDs before web_docs_fetch",
    promptGuidelines: [
      "Use web_docs_search before web_docs_fetch when the Context7 `library_id` is unknown.",
      "Use web_docs_search with both `library_name` and a descriptive `query`, then choose the best `library_id`.",
    ],
    parameters: WebDocsSearchParameters,
  },
  {
    name: WEB_DOCS_FETCH_TOOL_NAME,
    label: "Web Docs Fetch",
    description: `Retrieve focused Context7 docs for a known library ID. Returns Markdown by default, or JSON snippets when raw: true. Requires a valid Context7 library ID; API and network failures are tool errors. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_docs_fetch — retrieve focused Context7 docs",
    promptGuidelines: [
      "Use web_docs_fetch once the Context7 `library_id` is known; otherwise call web_docs_search first.",
      "Use web_docs_fetch only with Context7 library IDs such as `/facebook/react`, and ask a specific `query`.",
      "Use web_docs_fetch with `raw: true` only when you need JSON snippet objects instead of Markdown.",
    ],
    parameters: WebDocsFetchParameters,
  },
] as const satisfies readonly WebToolSpec[];

export function getWebToolSpec(name: WebToolName): WebToolSpec {
  const spec = WEB_TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`Unknown web tool: ${name}`);
  return spec;
}
