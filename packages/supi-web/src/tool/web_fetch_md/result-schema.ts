import { type Static, Type } from "typebox";
import { modelOutputSchema } from "../result-schema.ts";

const metrics = {
  url: Type.String({ description: "Resolved source URL." }),
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
