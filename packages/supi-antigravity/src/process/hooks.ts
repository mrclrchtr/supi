import type { IsolatedAntigravityPaths } from "../isolated-home.ts";
import { PROJECT_HOOK_PROBE_ARGUMENTS, runAntigravityProbe } from "./runner.ts";

/** Reduced state of project-local Antigravity hooks. */
export type ProjectHookState = "active" | "inactive" | "unknown";

/** Result of the bounded `/hooks` inspection. */
export interface ProjectHookProbeResult {
  state: ProjectHookState;
  warning?: string;
}

/** Inspect project-local hooks without retaining commands or hook configuration. */
export async function probeProjectHooks(options: {
  paths: IsolatedAntigravityPaths;
  cwd: string;
  signal?: AbortSignal;
  onProcessStart?: () => void;
}): Promise<ProjectHookProbeResult> {
  try {
    const result = await runAntigravityProbe({
      paths: options.paths,
      cwd: options.cwd,
      args: [...PROJECT_HOOK_PROBE_ARGUMENTS],
      signal: options.signal,
      timeoutMs: 15_000,
      onProcessStart: options.onProcessStart,
    });
    return classifyHookOutput(result.stdout, result.exitCode);
  } catch {
    return unknownHookResult();
  }
}

/** Classify bounded JSON output from the Antigravity hook command. */
export function classifyHookOutput(
  output: string,
  exitCode: number | null,
): ProjectHookProbeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
  } catch {
    return unknownHookResult();
  }
  const observation = inspectHookValue(parsed, { scope: "unknown", insideHookValue: false }, 0);
  if (observation.active) return activeHookResult();
  if (observation.inactive && exitCode === 0) return { state: "inactive" };
  return unknownHookResult();
}

type HookScope = "project" | "global" | "unknown";

interface HookContext {
  scope: HookScope;
  insideHookValue: boolean;
}

function inspectHookValue(
  value: unknown,
  context: HookContext,
  depth: number,
): { active: boolean; inactive: boolean } {
  if (depth > 8 || value === null || typeof value !== "object") {
    return { active: false, inactive: false };
  }
  if (Array.isArray(value)) return inspectHookArray(value, context, depth);
  if (!isRecord(value)) return { active: false, inactive: false };
  return inspectHookObject(value, context, depth);
}

function inspectHookArray(
  value: unknown[],
  context: HookContext,
  depth: number,
): { active: boolean; inactive: boolean } {
  const itemScopes = value.map(scopeOfValue);
  if (
    context.insideHookValue &&
    value.length > 0 &&
    itemScopes.every((scope) => scope === "global")
  ) {
    return { active: false, inactive: true };
  }
  const result = value.reduce<{ active: boolean; inactive: boolean }>(
    (current, item) => mergeHookObservation(current, inspectHookValue(item, context, depth + 1)),
    { active: false, inactive: false },
  );
  if (result.active || result.inactive || !context.insideHookValue) return result;
  if (value.length === 0 || context.scope === "global") {
    return { active: false, inactive: true };
  }
  return { active: true, inactive: false };
}

function inspectHookObject(
  value: Record<string, unknown>,
  context: HookContext,
  depth: number,
): { active: boolean; inactive: boolean } {
  const objectScope = scopeFromObject(value, context.scope);
  const objectContext = { ...context, scope: objectScope };
  return Object.entries(value).reduce<{ active: boolean; inactive: boolean }>(
    (result, [key, child]) =>
      mergeHookObservation(result, inspectHookProperty(key, child, objectContext, depth)),
    { active: false, inactive: false },
  );
}

function inspectHookProperty(
  key: string,
  child: unknown,
  context: HookContext,
  depth: number,
): { active: boolean; inactive: boolean } {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
  const childContext: HookContext = {
    scope: scopeFromKey(normalizedKey, context.scope),
    insideHookValue:
      context.insideHookValue || normalizedKey.includes("hook") || normalizedKey === "projecthooks",
  };
  if (childContext.insideHookValue && typeof child === "boolean") {
    return booleanHookState(normalizedKey, child, childContext.scope);
  }
  if (childContext.insideHookValue && typeof child === "string") {
    return stringHookState(child, childContext.scope);
  }
  if (typeof child === "string" && ["result", "output", "data", "value"].includes(normalizedKey)) {
    return inspectNestedJson(child, childContext, depth);
  }
  return inspectHookValue(child, childContext, depth + 1);
}

function inspectNestedJson(
  value: string,
  context: HookContext,
  depth: number,
): { active: boolean; inactive: boolean } {
  try {
    return inspectHookValue(JSON.parse(value), context, depth + 1);
  } catch {
    return { active: false, inactive: false };
  }
}

function scopeOfValue(value: unknown): HookScope | undefined {
  if (!isRecord(value)) return scopeFromValue(value);
  return scopeFromObject(value, "unknown");
}

function scopeFromObject(value: Record<string, unknown>, fallback: HookScope): HookScope {
  for (const key of ["scope", "source", "location"]) {
    const scope = scopeFromValue(value[key]);
    if (scope) return scope;
  }
  return fallback;
}

function scopeFromKey(key: string, fallback: HookScope): HookScope {
  if (key.includes("global")) return "global";
  if (key.includes("project") || key.includes("local")) return "project";
  return fallback;
}

function scopeFromValue(value: unknown): HookScope | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("global")) return "global";
  if (normalized.includes("project") || normalized.includes("local")) return "project";
  return undefined;
}

function booleanHookState(
  key: string,
  value: boolean,
  scope: HookScope,
): { active: boolean; inactive: boolean } {
  if (!["active", "enabled", "loaded", "running"].includes(key)) {
    return { active: false, inactive: false };
  }
  return scope === "global"
    ? { active: false, inactive: !value }
    : { active: value, inactive: !value };
}

function stringHookState(value: string, scope: HookScope): { active: boolean; inactive: boolean } {
  const normalized = value.toLowerCase();
  const active = ["active", "enabled", "running", "loaded"].includes(normalized);
  const inactive = ["inactive", "disabled", "none", "notfound"].includes(normalized);
  return scope === "global" ? { active: false, inactive } : { active, inactive };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeHookObservation(
  left: { active: boolean; inactive: boolean },
  right: { active: boolean; inactive: boolean },
): { active: boolean; inactive: boolean } {
  return { active: left.active || right.active, inactive: left.inactive || right.inactive };
}

function activeHookResult(): ProjectHookProbeResult {
  return {
    state: "active",
    warning:
      "Project-local Antigravity hooks are active. They can run commands, read the Antigravity transcript, and cause side effects outside the Inspection Permission Set.",
  };
}

function unknownHookResult(): ProjectHookProbeResult {
  return {
    state: "unknown",
    warning:
      "Project-local Antigravity hook state could not be determined. Hooks may run commands, read the Antigravity transcript, and cause side effects outside the Inspection Permission Set.",
  };
}
