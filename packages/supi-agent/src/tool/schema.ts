import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { ProfileCatalogue } from "../types.ts";
import {
  MAX_INSTRUCTIONS_CHARS,
  MAX_SHARED_CONTEXT_CHARS,
  MAX_TASK_ID_LENGTH,
  MAX_TASKS,
} from "./bounds.ts";

/** Build the model-facing tool parameter schema from the current Profile Catalogue. */
export function buildAgentRunSchema(catalogue: ProfileCatalogue): TSchema {
  const ids = catalogue.profiles.map((profile) => profile.id);
  const profileEnum =
    ids.length > 0
      ? StringEnum(ids as unknown as readonly string[] & [string, ...string[]], {
          description: "Profile ID to delegate this task to.",
        })
      : Type.String({
          minLength: 1,
          maxLength: 64,
          description: "Profile ID (no valid profiles available)",
        });

  const taskSchema = Type.Object(
    {
      id: Type.String({
        minLength: 1,
        maxLength: MAX_TASK_ID_LENGTH,
        description: "Unique task identifier for this batch.",
      }),
      profile: profileEnum,
      instructions: Type.String({
        minLength: 1,
        maxLength: MAX_INSTRUCTIONS_CHARS,
        description: "Self-contained task instructions.",
      }),
    },
    { additionalProperties: false },
  );

  return Type.Object(
    {
      tasks: Type.Array(taskSchema, {
        minItems: 1,
        maxItems: MAX_TASKS,
        description: "One to four independent Delegation Tasks.",
      }),
      sharedContext: Type.Optional(
        Type.String({
          maxLength: MAX_SHARED_CONTEXT_CHARS,
          description: "Optional context copied to every child Agent Run.",
        }),
      ),
    },
    { additionalProperties: false },
  );
}

export type AgentRunToolParams = {
  tasks: Array<{ id: string; profile: string; instructions: string }>;
  sharedContext?: string;
};
