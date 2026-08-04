import { clampThinkingLevel } from "@earendil-works/pi-ai";
import { makeDiagnostic } from "./profile-validation.ts";
import { createAgentSessionInputs } from "./resources.ts";
import type {
  AgentModelContext,
  AgentProfile,
  ProfileDiagnostic,
  ResolvedAgentProfile,
} from "./types.ts";

/** Resolve one profile against the containing session's model/auth boundary. */
export function resolveAgentProfile(
  profile: AgentProfile,
  context: AgentModelContext,
  resourceOptions: Omit<
    Parameters<typeof createAgentSessionInputs>[0],
    "profile" | "model" | "thinkingLevel"
  >,
): ResolvedAgentProfile | ProfileDiagnostic {
  const reference = profile.manifest.model;
  const model = reference
    ? resolveExplicitModel(profile, reference, context)
    : resolveInheritedModel(profile, context);
  if ("code" in model) return model;

  const requestedThinking = profile.manifest.thinking ?? context.currentThinkingLevel ?? "medium";
  const thinkingLevel = clampThinkingLevel(model, requestedThinking);
  return Object.freeze({
    profile,
    model,
    thinkingLevel,
    ...(profile.manifest.timeoutMinutes === undefined
      ? {}
      : { timeoutMs: profile.manifest.timeoutMinutes * 60_000 }),
    inputs: createAgentSessionInputs({
      ...resourceOptions,
      profile,
      model,
      thinkingLevel,
    }),
  });
}

function resolveExplicitModel(
  profile: AgentProfile,
  reference: string,
  context: AgentModelContext,
): ResolvedAgentProfile["model"] | ProfileDiagnostic {
  const slash = reference.indexOf("/");
  const provider = reference.slice(0, slash);
  const modelId = reference.slice(slash + 1);
  const model = context.modelRegistry.find(provider, modelId);
  if (!model) {
    return diagnostic(profile, "model-unavailable", "Configured model is unavailable.");
  }
  if (!context.modelRegistry.hasConfiguredAuth(model)) {
    return diagnostic(profile, "model-unauthenticated", "Configured model is not authenticated.");
  }
  if (!isAllowedByScope(model, context)) {
    return diagnostic(
      profile,
      "model-out-of-scope",
      "Configured model is outside the parent model scope.",
    );
  }
  return model;
}

function resolveInheritedModel(
  profile: AgentProfile,
  context: AgentModelContext,
): ResolvedAgentProfile["model"] | ProfileDiagnostic {
  const model = context.currentModel;
  if (!model)
    return diagnostic(profile, "model-unavailable", "The containing session has no active model.");
  if (!context.modelRegistry.hasConfiguredAuth(model)) {
    return diagnostic(
      profile,
      "model-unauthenticated",
      "The containing session model is not authenticated.",
    );
  }
  return model;
}

function isAllowedByScope(
  model: ResolvedAgentProfile["model"],
  context: AgentModelContext,
): boolean {
  if (context.scopedModels.length === 0) return true;
  return context.scopedModels.some(
    (entry) => entry.model.provider === model.provider && entry.model.id === model.id,
  );
}

function diagnostic(
  profile: AgentProfile,
  code: Extract<
    ProfileDiagnostic["code"],
    "model-unavailable" | "model-unauthenticated" | "model-out-of-scope"
  >,
  message: string,
): ProfileDiagnostic {
  return makeDiagnostic(profile.id, profile.source, code, message);
}
