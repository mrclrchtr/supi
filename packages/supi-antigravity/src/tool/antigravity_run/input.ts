import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";
import { buildModelCatalogueEnum, isAvailableCuratedModel } from "../../catalogue.ts";
import type { CuratedModel } from "../../types.ts";

/** Maximum prompt length accepted by one Antigravity Run. */
const MAX_PROMPT_CHARS = 32_000;
/** Maximum opaque handle length accepted from a follow-up. */
const MAX_HANDLE_CHARS = 128;

/** Input for a new Antigravity Run. */
export interface NewAntigravityInput {
  workspace: boolean;
  model: CuratedModel;
}

/** Input for a Conversation Handle follow-up. */
export interface ContinueAntigravityInput {
  handle: string;
}

/** The exact public antigravity_run input contract. */
export type AntigravityRunInput =
  | { prompt: string; new: NewAntigravityInput; continue?: never }
  | { prompt: string; new?: never; continue: ContinueAntigravityInput };

/** Build the dynamic tool schema from the immutable Model Catalogue. */
export function buildAntigravityRunSchema(catalogue: readonly CuratedModel[]): TSchema {
  if (catalogue.length === 0) {
    throw new Error("Cannot register antigravity_run without an available model.");
  }
  const prompt = Type.String({
    minLength: 1,
    maxLength: MAX_PROMPT_CHARS,
    description: "The bounded request to send to Antigravity.",
  });
  const newInput = Type.Object(
    {
      prompt,
      new: Type.Object(
        {
          workspace: Type.Boolean({
            description:
              "Expose the current PI workspace, or use the empty Consultation Workspace.",
          }),
          model: buildModelCatalogueEnum(catalogue),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  );
  const continueInput = Type.Object(
    {
      prompt,
      continue: Type.Object(
        {
          handle: Type.String({ minLength: 1, maxLength: MAX_HANDLE_CHARS }),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  );
  return Type.Union([newInput, continueInput]);
}

/** Validate exact-one input and the model against the same catalogue. */
export function parseAntigravityRunInput(
  value: unknown,
  catalogue: readonly CuratedModel[],
): AntigravityRunInput {
  if (!isRecord(value)) throw new Error("Invalid antigravity_run input.");
  const hasNew = value.new !== undefined;
  const hasContinue = value.continue !== undefined;
  if (hasNew === hasContinue) {
    throw new Error("antigravity_run requires exactly one of new or continue.");
  }
  const schema = buildAntigravityRunSchema(catalogue);
  if (!Value.Check(schema, value)) throw new Error("Invalid antigravity_run input.");
  const newInput = isRecord(value.new) ? value.new : undefined;
  const continueInput = isRecord(value.continue) ? value.continue : undefined;
  if (newInput) {
    if (
      typeof newInput.workspace !== "boolean" ||
      !isAvailableCuratedModel(newInput.model, catalogue)
    ) {
      throw new Error("The selected Antigravity model is not available in the Model Catalogue.");
    }
    return {
      prompt: value.prompt as string,
      new: { workspace: newInput.workspace, model: newInput.model },
    };
  }
  if (!continueInput || typeof continueInput.handle !== "string") {
    throw new Error("Invalid Antigravity Conversation Handle.");
  }
  return {
    prompt: value.prompt as string,
    continue: { handle: continueInput.handle },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
