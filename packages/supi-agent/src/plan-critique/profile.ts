import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentProfile } from "../types.ts";
import { PLAN_CRITIC_SYSTEM_PROMPT } from "./prompt.ts";

/** Stable identity of the Plan Critic's internal profile value; never a Profile ID in the catalogue. */
export const PLAN_CRITIC_PROFILE_ID = "plan-critic";

/**
 * Code-defined policy of the Plan Critic. It is not an Agent Profile: it has no Profile
 * Directory, is never in the Profile Catalogue, has no profile settings, and `agent_run`
 * cannot select it. It only reuses `createAgentSessionInputs()` and the model policy.
 */
export const PLAN_CRITIC_PROFILE: AgentProfile = Object.freeze({
  id: PLAN_CRITIC_PROFILE_ID,
  source: "package",
  // Descriptive only; resource compilation never reads a custom prompt from this path.
  directory: resolve(dirname(fileURLToPath(import.meta.url)), PLAN_CRITIC_PROFILE_ID),
  manifest: Object.freeze({
    description: "Independent check of the last agent answer",
    tools: Object.freeze([
      "read",
      "grep",
      "find",
      "ls",
      "bash",
      "code_resolve",
      "code_inspect",
      "code_orientation",
      "code_graph",
      "code_find",
      "code_health",
    ]),
    systemPrompt: "custom",
    instructionScopes: Object.freeze(["global", "project"]),
  }),
  customSystemPrompt: PLAN_CRITIC_SYSTEM_PROMPT,
}) as AgentProfile;
