import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunContext, AgentSessionInputs } from "@mrclrchtr/supi-agent-runtime/api";
import { createAgentRunProviderAuthority } from "@mrclrchtr/supi-agent-runtime/api";
import { isReadOnlyCapabilitySet } from "../../capabilities.ts";
import type { DelegationCheckpoint } from "../../delegation/checkpoints.ts";
import {
  type ConversationTargetResult,
  createConversationTargetResolver,
} from "../../delegation/conversation-state.ts";
import { resolveAgentProfile } from "../../model-policy.ts";
import { resolveProfileDefinition } from "../../profile-catalogue.ts";
import { resolveAgentDirectory } from "../../resources.ts";
import type { AgentModelContext, AgentProfile, ProfileCatalogue } from "../../types.ts";
import type { AgentRunTaskInput, AgentRunToolParams } from "./schema.ts";

interface PreflightError {
  taskId?: string;
  profileId: string;
  message: string;
}

interface CurrentProfileOptions {
  readonly catalogue: ProfileCatalogue;
  readonly ctx: ExtensionContext;
  readonly modelContext: AgentModelContext;
  readonly agentDir: string;
}

/** One Delegation Task after profile, model, resource, and capability preflight. */
export interface ResolvedTask {
  taskId: string;
  profileId: string;
  profile: AgentProfile;
  instructions: string;
  conversationId: string;
  conversationLabel: string;
  parentCheckpointId: string | null;
  baseContext?: AgentRunContext;
  previousRunStatus?: DelegationCheckpoint["runStatus"];
  previousFailureCode?: string;
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
  const resolveTarget = createConversationTargetResolver(ctx.sessionManager.getBranch());
  const profileOptions: CurrentProfileOptions = {
    catalogue,
    ctx,
    modelContext: buildModelContext(ctx),
    agentDir: resolveAgentDirectory(),
  };
  const resolved: ResolvedTask[] = [];
  const targets = new Set<string>();

  for (const task of params.tasks) {
    const result = resolvePreflightTask(task, resolveTarget(task), targets, profileOptions);
    if ("message" in result) errors.push(result);
    else resolved.push(result);
  }
  const mutationError = mutationBatchError(resolved, params.tasks.length);
  if (mutationError) errors.push(mutationError);
  return errors.length > 0 ? { errors } : { tasks: resolved };
}

/** Resolve current profile policy for a continuation or an agent_list availability row. */
export function currentProfileUnavailableReason(
  profileId: string,
  catalogue: ProfileCatalogue,
  ctx: ExtensionContext,
): string | undefined {
  const result = resolveCurrentProfile(profileId, {
    catalogue,
    ctx,
    modelContext: buildModelContext(ctx),
    agentDir: resolveAgentDirectory(),
  });
  return "error" in result ? result.error : undefined;
}

function resolvePreflightTask(
  task: AgentRunTaskInput,
  target: ConversationTargetResult,
  targets: Set<string>,
  profileOptions: CurrentProfileOptions,
): ResolvedTask | PreflightError {
  if ("error" in target) {
    return { taskId: task.id, profileId: target.profileId, message: target.error };
  }
  if (targets.has(target.conversationId)) {
    return {
      taskId: task.id,
      profileId: target.profileId,
      message: `Duplicate conversation target "${target.conversationId}".`,
    };
  }
  targets.add(target.conversationId);

  const policy = resolveCurrentProfile(target.profileId, profileOptions);
  if ("error" in policy) {
    return { taskId: task.id, profileId: target.profileId, message: policy.error };
  }
  const inputs: AgentSessionInputs = {
    ...policy.effective.inputs,
    ...(target.context ? { context: target.context } : {}),
  };
  return {
    taskId: task.id,
    profileId: target.profileId,
    profile: policy.profile,
    instructions: task.instructions,
    conversationId: target.conversationId,
    conversationLabel: target.label,
    parentCheckpointId: target.parentCheckpointId,
    ...(target.context ? { baseContext: target.context } : {}),
    ...(target.previousRunStatus ? { previousRunStatus: target.previousRunStatus } : {}),
    ...(target.previousFailureCode ? { previousFailureCode: target.previousFailureCode } : {}),
    timeoutMs: policy.effective.timeoutMs,
    model: policy.effective.model,
    inputs,
  };
}

function resolveCurrentProfile(
  profileId: string,
  options: CurrentProfileOptions,
):
  | {
      profile: AgentProfile;
      effective: Exclude<ReturnType<typeof resolveAgentProfile>, { code: string }>;
    }
  | { error: string } {
  const profileEntry = options.catalogue.profileIds.includes(profileId)
    ? options.catalogue.profiles.find((profile) => profile.id === profileId)
    : undefined;
  if (!profileEntry) {
    return { error: `Agent Profile "${profileId}" is unknown or unavailable.` };
  }
  const profile = resolveProfileDefinition(profileEntry, options.catalogue.sourceDirectories);
  if ("code" in profile) return { error: profile.message };
  const effective = resolveAgentProfile(profile, options.modelContext, {
    cwd: options.ctx.cwd,
    agentDir: options.agentDir,
    projectTrusted: options.ctx.isProjectTrusted(),
    providerAuthority: options.modelContext.providerAuthority,
  });
  if ("code" in effective) return { error: effective.message };
  return { profile, effective };
}

function mutationBatchError(
  tasks: readonly ResolvedTask[],
  taskCount: number,
): PreflightError | undefined {
  const hasMutationProfile = tasks.some(
    (task) => !isReadOnlyCapabilitySet(task.profile.manifest.tools),
  );
  if (!hasMutationProfile || taskCount <= 1) return undefined;
  return {
    profileId: "(batch)",
    message:
      "Mutation-capable profiles require a single-task batch. Reduce to one task or use only read-only profiles.",
  };
}

function duplicateTaskErrors(params: AgentRunToolParams): PreflightError[] {
  const errors: PreflightError[] = [];
  const ids = new Set<string>();
  for (const task of params.tasks) {
    if (ids.has(task.id)) {
      errors.push({
        taskId: task.id,
        profileId: taskProfile(task),
        message: `Duplicate task ID "${task.id}".`,
      });
    }
    ids.add(task.id);
  }
  return errors;
}

function taskProfile(task: AgentRunTaskInput): string {
  return "new" in task ? task.new.profile : "(continue)";
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
