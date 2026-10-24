import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { ProfileCatalogue } from "../../types.ts";
import {
  MAX_INSTRUCTIONS_CHARS,
  MAX_SHARED_CONTEXT_CHARS,
  MAX_TASK_ID_LENGTH,
  MAX_TASKS,
} from "./bounds.ts";

/** Build the tool schema with only effective Profile IDs and their resolved descriptions. */
export function buildAgentRunSchema(catalogue: ProfileCatalogue): TSchema {
  const ids = catalogue.profileIds;
  const profileEnum =
    ids.length > 0
      ? StringEnum(ids as unknown as readonly string[] & [string, ...string[]], {
          description: ids
            .map((id) => {
              const profile = catalogue.profiles.find((entry) => entry.id === id);
              const description = (profile?.description ?? id).replace(/\s+/g, " ").trim();
              return `${id}: ${description}`;
            })
            .join("\n"),
        })
      : Type.String({
          minLength: 1,
          maxLength: 64,
          description: "Profile ID (no valid profiles available)",
        });

  const commonTaskProperties = {
    id: Type.String({
      minLength: 1,
      maxLength: MAX_TASK_ID_LENGTH,
      description: "Unique task identifier for this batch.",
    }),
    instructions: Type.String({
      minLength: 1,
      maxLength: MAX_INSTRUCTIONS_CHARS,
      description:
        "Scoped objective, required result, and task-specific findings with accessible sources or excerpts. Label uncertainty. For follow-ups, include only new work or changed facts.",
    }),
  };
  const taskSchema = Type.Object(
    {
      ...commonTaskProperties,
      new: Type.Optional(Type.Object({ profile: profileEnum }, { additionalProperties: false })),
      continue: Type.Optional(
        Type.Object(
          {
            conversationId: Type.String({
              minLength: 1,
              maxLength: 128,
              description: "Conversation reference returned by agent_run or agent_list.",
            }),
          },
          { additionalProperties: false },
        ),
      ),
    },
    {
      additionalProperties: false,
      minProperties: 3,
      maxProperties: 3,
      description: "Select exactly one: new conversation or follow-up to a saved conversation.",
    },
  );

  return Type.Object(
    {
      tasks: Type.Array(taskSchema, {
        minItems: 1,
        maxItems: MAX_TASKS,
        description: "One to four independent Delegation Tasks or Follow-Ups.",
      }),
      mode: Type.Optional(
        StringEnum(["background", "foreground"], {
          description:
            "Default: background for read-only tasks in TUI/RPC; foreground otherwise. Background rejects mutation-capable profiles and print/JSON modes.",
        }),
      ),
      sharedContext: Type.Optional(
        Type.String({
          maxLength: MAX_SHARED_CONTEXT_CHARS,
          description:
            "Evidence and background needed by every task, with uncertainty labeled. For follow-ups, include only new or changed context.",
        }),
      ),
    },
    { additionalProperties: false },
  );
}

export type AgentRunTaskInput =
  | { id: string; new: { profile: string }; instructions: string }
  | { id: string; continue: { conversationId: string }; instructions: string };

export type AgentRunToolParams = {
  tasks: AgentRunTaskInput[];
  sharedContext?: string;
  mode?: "background" | "foreground";
};
