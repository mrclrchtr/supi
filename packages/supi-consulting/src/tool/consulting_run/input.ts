import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";
import { buildModelCatalogueEnum, isAvailableModel } from "../../catalogue.ts";
import type { ConsultingModel } from "../../types.ts";

const MAX_PROMPT_CHARS = 32_000;
const MAX_HANDLE_CHARS = 128;

/** Input for a new Consultation. */
export interface NewConsultationInput {
  agent: string;
  model: ConsultingModel;
  workspace: boolean;
}

/** Input for a Conversation Handle follow-up. */
export interface ContinueConsultationInput {
  handle: string;
}

/** Exact-one consulting_run input contract. */
export type ConsultingRunInput =
  | { prompt: string; new: NewConsultationInput; continue?: never }
  | { prompt: string; new?: never; continue: ContinueConsultationInput };

/** Build the dynamic tool schema from one immutable agent and model snapshot. */
export function buildConsultingRunSchema(agent: string, catalogue: readonly string[]): TSchema {
  if (!agent || catalogue.length === 0) {
    throw new Error("Cannot register consulting_run without an available agent and model.");
  }
  const prompt = Type.String({
    minLength: 1,
    maxLength: MAX_PROMPT_CHARS,
    description: "The bounded request for one Consultation.",
  });
  return Type.Object(
    {
      prompt,
      new: Type.Optional(
        Type.Object(
          {
            agent: StringEnum([agent], {
              description: "The Consulting Agent that will perform this Consultation.",
            }),
            model: buildModelCatalogueEnum(catalogue),
            workspace: Type.Boolean({
              description:
                "true exposes the current PI workspace; false uses the empty Consultation Workspace.",
            }),
          },
          { additionalProperties: false },
        ),
      ),
      continue: Type.Optional(
        Type.Object(
          {
            handle: Type.String({
              minLength: 1,
              maxLength: MAX_HANDLE_CHARS,
              description: "Conversation Handle returned by consulting_run.",
            }),
          },
          {
            additionalProperties: false,
            description: "Continue the existing Consultation with its original selection.",
          },
        ),
      ),
    },
    {
      minProperties: 2,
      maxProperties: 2,
      additionalProperties: false,
    },
  );
}

/** Validate exact-one input against the immutable availability snapshot. */
export function parseConsultingRunInput(
  value: unknown,
  agent: string,
  catalogue: readonly string[],
): ConsultingRunInput {
  if (!isRecord(value)) throw new Error("Invalid consulting_run input.");
  const hasNew = Object.hasOwn(value, "new");
  const hasContinue = Object.hasOwn(value, "continue");
  if (hasNew === hasContinue) {
    throw new Error("consulting_run requires exactly one of new or continue.");
  }
  const schema = buildConsultingRunSchema(agent, catalogue);
  if (!Value.Check(schema, value)) throw new Error("Invalid consulting_run input.");
  const newInput = isRecord(value.new) ? value.new : undefined;
  const continueInput = isRecord(value.continue) ? value.continue : undefined;
  if (newInput) {
    if (newInput.agent !== agent) throw new Error("The selected Consulting Agent is unavailable.");
    if (typeof newInput.workspace !== "boolean" || !isAvailableModel(newInput.model, catalogue)) {
      throw new Error("The selected model is not available in the Consulting Agent catalogue.");
    }
    return {
      prompt: value.prompt as string,
      new: {
        agent: newInput.agent,
        model: newInput.model,
        workspace: newInput.workspace,
      },
    };
  }
  if (!continueInput || typeof continueInput.handle !== "string") {
    throw new Error("Invalid Conversation Handle.");
  }
  return { prompt: value.prompt as string, continue: { handle: continueInput.handle } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
