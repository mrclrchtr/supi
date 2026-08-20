// Leaf module for web_fetch_md input vocabulary.
//
// The parameter schema and its constants live here (not in spec.ts) so
// execute.ts can read them without importing spec.ts; spec.ts imports the
// execute binding, and a spec <-> execute cycle would risk undefined
// bindings depending on module evaluation order.

import { StringEnum } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { Type } from "typebox";
import { FETCH_TIMEOUT_MAX_MS } from "../../fetch.ts";

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
