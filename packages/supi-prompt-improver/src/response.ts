import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { NormalizedQuestionnaire } from "@mrclrchtr/supi-ask-user/api";
import { AskUserParamsSchema, normalizeQuestionnaire } from "@mrclrchtr/supi-ask-user/api";
import { Type } from "typebox";
import { Value } from "typebox/value";

const ProposalSchema = Type.Object(
  {
    kind: Type.Literal("proposal"),
    proposal: Type.String(),
  },
  { additionalProperties: false },
);
const UnchangedSchema = Type.Object(
  { kind: Type.Literal("unchanged") },
  { additionalProperties: false },
);
/** Keep the shared form fields, but reject extra model-generated fields. */
const [ChoiceQuestionSchema, TextQuestionSchema] =
  AskUserParamsSchema.properties.questions.items.anyOf;
const StrictChoiceQuestionSchema = Type.Object(
  {
    ...ChoiceQuestionSchema.properties,
    options: {
      ...ChoiceQuestionSchema.properties.options,
      items: { ...ChoiceQuestionSchema.properties.options.items, additionalProperties: false },
    },
  },
  { additionalProperties: false },
);
const StrictQuestionSchema = Type.Union([
  StrictChoiceQuestionSchema,
  { ...TextQuestionSchema, additionalProperties: false },
]);
const ImprovementQuestionnaireSchema = Type.Object(
  {
    ...AskUserParamsSchema.properties,
    questions: {
      ...AskUserParamsSchema.properties.questions,
      items: StrictQuestionSchema,
    },
  },
  { additionalProperties: false },
);
const ClarificationSchema = Type.Object(
  {
    kind: Type.Literal("clarification"),
    questionnaire: ImprovementQuestionnaireSchema,
  },
  { additionalProperties: false },
);
/** Stable response schema for both requests. The workflow permits clarification only once. */
export const ImprovementSchema = Type.Union([ProposalSchema, ClarificationSchema, UnchangedSchema]);

/** Validated response with a normalized clarification form when needed. */
export type ImprovementResponse =
  | { kind: "proposal"; proposal: string }
  | { kind: "clarification"; questionnaire: NormalizedQuestionnaire }
  | { kind: "unchanged" };

/** Parse and validate one complete response without changing literal proposal text. */
export function parseImprovementResponse(message: AssistantMessage): ImprovementResponse {
  const value = parseModelJson(message);
  if (!Value.Check(ImprovementSchema, value)) {
    throw new Error("The improver returned an invalid response.");
  }
  if (value.kind === "unchanged") return value;
  if (value.kind === "proposal") return requireProposal(value.proposal);
  try {
    return {
      kind: "clarification",
      questionnaire: normalizeQuestionnaire(value.questionnaire),
    };
  } catch (error) {
    throw new Error("The improver returned an invalid clarification form.", { cause: error });
  }
}

/** Read only a complete normal text response. */
function parseModelJson(message: AssistantMessage): unknown {
  if (message.stopReason !== "stop") {
    throw new Error("The improver request did not complete normally.");
  }
  if (message.content.some((part) => part.type === "toolCall")) {
    throw new Error("The improver returned a tool call instead of a proposal.");
  }
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) throw new Error("The improver returned no response text.");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("The improver returned invalid JSON.", { cause: error });
  }
}

function requireProposal(proposal: string): { kind: "proposal"; proposal: string } {
  if (!proposal.trim()) throw new Error("The improver returned an empty proposal.");
  return { kind: "proposal", proposal };
}
