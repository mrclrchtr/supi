// Leaf module for web_fetch_md input vocabulary.
//
// The parameter schema and its constants live here (not in spec.ts) so
// execute.ts can read them without importing spec.ts; spec.ts imports the
// execute binding, and a spec <-> execute cycle would risk undefined
// bindings depending on module evaluation order.

import type { Static } from "typebox";
import { Type } from "typebox";
import { FETCH_TIMEOUT_MAX_MS } from "../../fetch.ts";

export const WEB_FETCH_INLINE_MAX_CHARS = 15_000;
export const WEB_FETCH_OUTPUT_MODES = ["auto", "inline", "file"] as const;
export type WebFetchOutputMode = (typeof WEB_FETCH_OUTPUT_MODES)[number];

/** Explicit retrieval routes; enabling Firecrawl never changes the default route. */
export const WEB_FETCH_MODES = ["direct", "firecrawl_fallback", "firecrawl"] as const;
export type WebFetchMode = (typeof WEB_FETCH_MODES)[number];

const OutputModeEnum = Type.Enum(WEB_FETCH_OUTPUT_MODES, {
  type: "string",
  default: "auto",
  description: "auto, inline, or file output",
});

export const webFetchMdParameters = Type.Object(
  {
    url: Type.String({ description: "Public http(s) URL" }),
    outputMode: Type.Optional(OutputModeEnum),
    fetchMode: Type.Optional(
      Type.Enum(WEB_FETCH_MODES, {
        type: "string",
        default: "direct",
        description:
          "direct fetches locally; firecrawl_fallback uses Firecrawl only after HTTP 403; firecrawl skips direct fetching for JS-heavy or poorly extracted pages. Firecrawl requires opt-in via /supi-settings and FIRECRAWL_API_KEY, shares the URL and may consume credits. Never use it for signed, login-protected, private, or paywalled URLs.",
      }),
    ),
    absLinks: Type.Optional(
      Type.Boolean({
        description: "Absolutize HTML links/images; false preserves original destinations.",
        default: true,
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Integer({
        description: "Timeout per direct request and for the complete Firecrawl attempt (ms)",
        default: 30_000,
        minimum: 0,
        maximum: FETCH_TIMEOUT_MAX_MS,
      }),
    ),
  },
  { additionalProperties: false },
);

export type WebFetchMdInput = Static<typeof webFetchMdParameters>;
