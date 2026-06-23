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
  description: "auto, inline, or file output",
});

const WebFetchMdParameters = Type.Object(
  {
    url: Type.String({ description: "Public http(s) URL" }),
    output_mode: Type.Optional(OutputModeEnum),
    abs_links: Type.Optional(Type.Boolean({ description: "Absolute links/images", default: true })),
    timeout_ms: Type.Optional(Type.Number({ description: "Fetch timeout (ms)", default: 30_000 })),
  },
  { additionalProperties: false },
);

const WebDocsSearchParameters = Type.Object(
  {
    library_name: Type.String({
      description: "Library name (e.g. react, next.js, fastapi)",
    }),
    query: Type.String({
      description: "Task/question for relevance ranking",
    }),
  },
  { additionalProperties: false },
);

const WebDocsFetchParameters = Type.Object(
  {
    library_id: Type.String({
      description: "Context7 ID (e.g. /facebook/react); search first if unknown",
    }),
    query: Type.String({ description: "Specific docs question" }),
    raw: Type.Optional(
      Type.Boolean({
        description: "Return JSON snippets instead of Markdown",
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
    description: `Fetch public http(s) URL as Markdown. Not for login/private pages; ask for allowed source. auto: inline <=${WEB_FETCH_INLINE_MAX_CHARS.toLocaleString()} chars else temp; inline: may truncate; file: temp path. Links absolute by default. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_fetch_md: public URL to Markdown",
    promptGuidelines: ["Use web_fetch_md only for public http(s); ask if login/private."],
    parameters: WebFetchMdParameters,
  },
  {
    name: WEB_DOCS_SEARCH_TOOL_NAME,
    label: "Web Docs Search",
    description: `Search Context7 for library IDs; returns compact Markdown. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_docs_search: Context7 library IDs",
    promptGuidelines: ["Use web_docs_search before web_docs_fetch if ID unknown."],
    parameters: WebDocsSearchParameters,
  },
  {
    name: WEB_DOCS_FETCH_TOOL_NAME,
    label: "Web Docs Fetch",
    description: `Fetch focused Context7 docs for known library_id; Markdown default, raw=true JSON snippets. Search first if unknown. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: "web_docs_fetch: focused Context7 docs",
    promptGuidelines: ["Use web_docs_fetch with known ID and narrow query; raw only for JSON."],
    parameters: WebDocsFetchParameters,
  },
] as const satisfies readonly WebToolSpec[];

export function getWebToolSpec(name: WebToolName): WebToolSpec {
  const spec = WEB_TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`Unknown web tool: ${name}`);
  return spec;
}
