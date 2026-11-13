import { type TSchema, Type } from "typebox";
import { isReadOnlyCapabilitySet, selectedWebCapabilities } from "../../capabilities.ts";
import { resolveProfileDefinition } from "../../profile-catalogue.ts";
import type { AgentCapabilityId, ProfileCatalogue } from "../../types.ts";
import {
  MAX_INSTRUCTIONS_CHARS,
  MAX_SHARED_CONTEXT_CHARS,
  MAX_TASK_ID_LENGTH,
  MAX_TASKS,
} from "./bounds.ts";

/** Build the selection schema with effective Profile IDs, purposes, and compact capability tags. */
export function buildAgentRunSchema(catalogue: ProfileCatalogue): TSchema {
  const ids = catalogue.profileIds;
  const profileEnum =
    ids.length > 0
      ? Type.Enum(ids as unknown as readonly string[] & [string, ...string[]], {
          type: "string",
          description: [
            "No inherited parent tools. Web tags list allowed Web tools; a run receives them only when the containing session provides them.",
            ...ids.map((id) => {
              const entry = catalogue.profiles.find((profile) => profile.id === id);
              const description = (entry?.description ?? id).replace(/\s+/g, " ").trim();
              // Resolve the captured sources without refreshing live Model/Thinking settings.
              const profile = entry && resolveProfileDefinition(entry);
              if (!profile || "code" in profile) return `${id}: ${description}`;

              return `${id}: ${description} [${summarizeCapabilities(profile.manifest.tools)}]`;
            }),
          ].join("\n"),
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
      new: Type.Optional(
        Type.Object(
          {
            profile: profileEnum,
            cwd: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 4096,
                description:
                  "Absolute working directory for this conversation, such as a sibling Git worktree of the same repository. Default: the parent's cwd. Follow-ups keep it.",
              }),
            ),
          },
          { additionalProperties: false },
        ),
      ),
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
        Type.Enum(["background", "foreground"], {
          type: "string",
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

function summarizeCapabilities(tools: readonly AgentCapabilityId[]): string {
  const tags = isReadOnlyCapabilitySet(tools) ? ["read-only"] : [];
  tags.push(tools.includes("bash") ? "shell" : "no shell");
  if (tools.includes("edit") || tools.includes("write")) tags.push("edit");
  const web = selectedWebCapabilities(tools);
  if (web.length > 0) tags.push(`web when available: ${web.join(", ")}`);
  return tags.join("; ");
}

export type AgentRunTaskInput =
  | { id: string; new: { profile: string; cwd?: string }; instructions: string }
  | { id: string; continue: { conversationId: string }; instructions: string };

export type AgentRunToolParams = {
  tasks: AgentRunTaskInput[];
  sharedContext?: string;
  mode?: "background" | "foreground";
};
