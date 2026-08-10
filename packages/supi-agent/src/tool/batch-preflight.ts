import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentSessionInputs } from "@mrclrchtr/supi-agent-runtime/api";
import { createAgentRunProviderAuthority } from "@mrclrchtr/supi-agent-runtime/api";
import { isReadOnlyCapabilitySet } from "../capabilities.ts";
import { resolveAgentProfile } from "../model-policy.ts";
import { resolveProfileDefinition } from "../profile-catalogue.ts";
import { resolveAgentDirectory } from "../resources.ts";
import type { AgentModelContext, AgentProfile, ProfileCatalogue } from "../types.ts";
import type { AgentRunToolParams } from "./schema.ts";

interface PreflightError {
  taskId?: string;
  profileId: string;
  message: string;
}

/** One Delegation Task after profile, model, resource, and capability preflight. */
export interface ResolvedTask {
  taskId: string;
  profileId: string;
  profile: AgentProfile;
  instructions: string;
  timeoutMs?: number;
  model: AgentSessionInputs["model"];
  inputs: AgentSessionInputs;
}

/** Validate one Delegation Batch atomically before any Agent Run starts. */
export function preflightDelegationBatch(
  params: AgentRunToolParams,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
): { tasks: ResolvedTask[] } | { errors: PreflightError[] } {
  const errors = duplicateTaskErrors(params);
  if (errors.length > 0) return { errors };

  const resolved: ResolvedTask[] = [];
  const modelContext = buildModelContext(ctx);
  const agentDir = resolveAgentDirectory();
  for (const task of params.tasks) {
    const profileEntry = catalogue.profileIds.includes(task.profile)
      ? catalogue.profiles.find((profile) => profile.id === task.profile)
      : undefined;
    if (!profileEntry) {
      errors.push({
        taskId: task.id,
        profileId: task.profile,
        message: `Unknown profile "${task.profile}" or profile is unavailable.`,
      });
      continue;
    }
    const profile = resolveProfileDefinition(profileEntry, catalogue.sourceDirectories);
    if ("code" in profile) {
      errors.push({ taskId: task.id, profileId: task.profile, message: profile.message });
      continue;
    }
    const effective = resolveAgentProfile(profile, modelContext, {
      cwd: ctx.cwd,
      agentDir,
      projectTrusted: ctx.isProjectTrusted(),
      providerAuthority: modelContext.providerAuthority,
    });
    if ("code" in effective) {
      errors.push({ taskId: task.id, profileId: task.profile, message: effective.message });
      continue;
    }
    resolved.push({
      taskId: task.id,
      profileId: task.profile,
      profile,
      instructions: task.instructions,
      timeoutMs: effective.timeoutMs,
      model: effective.model,
      inputs: effective.inputs,
    });
  }

  if (
    resolved.some((task) => !isReadOnlyCapabilitySet(task.profile.manifest.tools)) &&
    params.tasks.length > 1
  ) {
    errors.push({
      profileId: "(batch)",
      message:
        "Mutation-capable profiles require a single-task batch. Reduce to one task or use only read-only profiles.",
    });
  }
  return errors.length > 0 ? { errors } : { tasks: resolved };
}

function duplicateTaskErrors(params: AgentRunToolParams): PreflightError[] {
  const errors: PreflightError[] = [];
  const ids = new Set<string>();
  for (const task of params.tasks) {
    if (ids.has(task.id)) {
      errors.push({
        taskId: task.id,
        profileId: task.profile,
        message: `Duplicate task ID "${task.id}".`,
      });
    }
    ids.add(task.id);
  }
  return errors;
}

function buildModelContext(ctx: ExtensionContext): AgentModelContext {
  return {
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
    currentModel: ctx.model,
    currentThinkingLevel: ctx.thinkingLevel,
    scopedModels: ctx.scopedModels.map((entry) => ({
      model: entry.model,
      thinkingLevel: entry.thinkingLevel,
    })),
    modelRegistry: ctx.modelRegistry,
  };
}
