import { type Static, Type } from "typebox";

const nullableNumber = Type.Union([Type.Number(), Type.Null()]);

/** Exact capacity-only result, shared by concise, inline, and file-reference paths. */
export const contextPressureSnapshotSchema = Type.Object(
  {
    modelName: Type.String(),
    contextWindow: nullableNumber,
    usedTokens: Type.Number(),
    usagePercent: nullableNumber,
    compactionEnabled: Type.Boolean(),
    reserveTokens: Type.Number(),
    headroomTokens: nullableNumber,
    pressurePercent: nullableNumber,
    compacted: Type.Boolean(),
    approximationNote: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

const namedTokensSchema = Type.Object(
  { name: Type.String(), tokens: Type.Number() },
  { additionalProperties: false },
);

const contextFileSchema = Type.Object(
  {
    path: Type.String(),
    tokens: Type.Number(),
    lines: Type.Number(),
    origin: Type.Union([Type.Literal("global"), Type.Literal("project")]),
  },
  { additionalProperties: false },
);

const attributionSchema = Type.Object(
  {
    scaled: Type.Boolean(),
    categories: Type.Object(
      {
        systemPrompt: Type.Number(),
        userMessages: Type.Number(),
        assistantMessages: Type.Number(),
        toolCalls: Type.Number(),
        toolResults: Type.Number(),
        other: Type.Number(),
      },
      { additionalProperties: false },
    ),
    systemPromptBreakdown: Type.Object(
      {
        base: Type.Number(),
        instructionFiles: Type.Array(contextFileSchema),
        contextFiles: Type.Array(contextFileSchema),
        skills: Type.Array(namedTokensSchema),
        guidelines: Type.Number(),
        toolSnippets: Type.Number(),
        toolSnippetDetails: Type.Array(namedTokensSchema),
        guidelineSources: Type.Array(
          Type.Object(
            { source: Type.String(), tokens: Type.Number(), bulletCount: Type.Number() },
            { additionalProperties: false },
          ),
        ),
        appendText: Type.Number(),
      },
      { additionalProperties: false },
    ),
    injectedFiles: Type.Array(
      Type.Object(
        { file: Type.String(), turn: Type.Number(), tokens: Type.Number(), lines: Type.Number() },
        { additionalProperties: false },
      ),
    ),
    toolDefinitions: Type.Object(
      { count: Type.Number(), tokens: Type.Number(), tools: Type.Array(namedTokensSchema) },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const inlineResultSchema = Type.Object(
  { ...contextPressureSnapshotSchema.properties, attribution: attributionSchema },
  { additionalProperties: false },
);

const fileResultSchema = Type.Object(
  {
    ...contextPressureSnapshotSchema.properties,
    attributionFile: Type.Object(
      { path: Type.String(), bytes: Type.Integer({ minimum: 0 }) },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

/** Capacity-only, complete inline attribution, or a reference to that complete result. */
export const contextReportOutputSchema = Type.Union([
  contextPressureSnapshotSchema,
  inlineResultSchema,
  fileResultSchema,
]);

/** Capacity-only native result. */
export type ContextReportSnapshot = Static<typeof contextPressureSnapshotSchema>;

/** Complete focused result before applying the inline output limit. */
export type ContextReportInlineResult = Static<typeof inlineResultSchema>;

/** JSON-serializable public contract, independent of the human report details. */
export type ContextReportOutput = Static<typeof contextReportOutputSchema>;
