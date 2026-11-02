import { type Static, Type } from "typebox";
import { modelOutputSchema } from "../result-schema.ts";

/** Bound external provenance used in model-visible file summaries. */
export const FIRECRAWL_METADATA_MAX_CHARS = 128;

const firecrawlRetrievalSchema = Type.Object({
  provider: Type.Literal("firecrawl"),
  cacheState: Type.Optional(Type.String({ maxLength: FIRECRAWL_METADATA_MAX_CHARS })),
  cachedAt: Type.Optional(Type.String({ maxLength: FIRECRAWL_METADATA_MAX_CHARS })),
});

/** External reader provenance; missing cache metadata does not imply a fresh fetch. */
export type FirecrawlRetrieval = Static<typeof firecrawlRetrievalSchema>;

const metrics = {
  url: Type.String({ description: "Source URL; the requested URL when using Firecrawl." }),
  retrieval: Type.Optional(firecrawlRetrievalSchema),
  chars: Type.Integer({ minimum: 0 }),
  lines: Type.Integer({ minimum: 0 }),
};

/** Page payload, or a file reference when auto/file delivery selects a file. */
export const webFetchMdOutputSchema = Type.Union([
  Type.Object({
    ...metrics,
    mode: Type.Literal("inline"),
    markdown: Type.String(),
    modelOutput: modelOutputSchema,
  }),
  Type.Object({
    ...metrics,
    mode: Type.Literal("file"),
    filePath: Type.String(),
  }),
]);

/** Complete Markdown in inline mode; file mode retains the existing disk delivery. */
export type WebFetchMdOutput = Static<typeof webFetchMdOutputSchema>;
