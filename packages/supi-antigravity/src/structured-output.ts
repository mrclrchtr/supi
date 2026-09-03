import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";
import type { AntigravityAnswer } from "./types.ts";

/** Maximum length of Antigravity's final answer text. */
export const MAX_ANSWER_CHARS = 16_000;
/** Maximum source references accepted from one answer. */
export const MAX_SOURCES = 8;
/** Maximum workspace references accepted from one answer. */
export const MAX_WORKSPACE_EVIDENCE = 8;
/** Maximum source title length. */
export const MAX_SOURCE_TITLE_CHARS = 240;
/** Maximum source URL length. */
export const MAX_SOURCE_URL_CHARS = 1_024;
/** Maximum workspace evidence path length. */
export const MAX_WORKSPACE_PATH_CHARS = 512;
/** Maximum workspace evidence summary length. */
export const MAX_EVIDENCE_SUMMARY_CHARS = 1_000;

/** JSON Schema passed to agy for every paid Antigravity Run. */
export const ANTIGRAVITY_ANSWER_SCHEMA: TSchema = Type.Object(
  {
    answer: Type.String({
      minLength: 1,
      maxLength: MAX_ANSWER_CHARS,
      description: "The answer to the user's request.",
    }),
    sources: Type.Array(
      Type.Object(
        {
          title: Type.String({ minLength: 1, maxLength: MAX_SOURCE_TITLE_CHARS }),
          url: Type.String({ minLength: 1, maxLength: MAX_SOURCE_URL_CHARS }),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_SOURCES },
    ),
    workspaceEvidence: Type.Array(
      Type.Object(
        {
          path: Type.String({ minLength: 1, maxLength: MAX_WORKSPACE_PATH_CHARS }),
          summary: Type.String({ minLength: 1, maxLength: MAX_EVIDENCE_SUMMARY_CHARS }),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_WORKSPACE_EVIDENCE },
    ),
  },
  { additionalProperties: false },
);

/** Validate and return the exact structured answer shape. */
export function validateAntigravityAnswer(value: unknown): AntigravityAnswer {
  if (!Value.Check(ANTIGRAVITY_ANSWER_SCHEMA, value)) {
    throw new Error("Antigravity returned invalid structured output.");
  }
  return value as AntigravityAnswer;
}
