import { StringEnum } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { Type } from "typebox";
import { FETCH_TIMEOUT_MAX_MS } from "../../fetch.ts";

export const WEB_FETCH_MD_TOOL_NAME = "web_fetch_md";
export const WEB_FETCH_MD_TOOL_LABEL = "Web Fetch";

export const WEB_FETCH_INLINE_MAX_CHARS = 15_000;
export const WEB_FETCH_OUTPUT_MODES = ["auto", "inline", "file"] as const;
export type WebFetchOutputMode = (typeof WEB_FETCH_OUTPUT_MODES)[number];

const OutputModeEnum = StringEnum(WEB_FETCH_OUTPUT_MODES, {
  default: "auto",
  description: "auto, inline, or file output",
});

export const webFetchMdParameters = Type.Object(
  {
    url: Type.String({ description: "Public http(s) URL" }),
    output_mode: Type.Optional(OutputModeEnum),
    abs_links: Type.Optional(Type.Boolean({ description: "Absolute links/images", default: true })),
    timeout_ms: Type.Optional(
      Type.Integer({
        description: "Fetch timeout (ms)",
        default: 30_000,
        minimum: 0,
        maximum: FETCH_TIMEOUT_MAX_MS,
      }),
    ),
  },
  { additionalProperties: false },
);

export type WebFetchMdInput = Static<typeof webFetchMdParameters>;

/** Canonical provider-facing metadata for the web_fetch_md tool. */
export const webFetchMdSpec = {
  name: WEB_FETCH_MD_TOOL_NAME,
  label: WEB_FETCH_MD_TOOL_LABEL,
  parameters: webFetchMdParameters,
} as const;
