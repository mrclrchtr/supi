// Configurable tool prompt-surface overrides.
//
// Resolution order: package defaults ← global SuPi config ← trusted project SuPi config.
// Project overrides are trust-gated; they require PI project trust and a PI-recognized
// trust-requiring resource (e.g. .pi/settings.json).

import {
  type ExtensionContext,
  hasTrustRequiringProjectResources,
} from "@earendil-works/pi-coding-agent";
import type { SuiPiToolPromptSurface } from "../tool-framework.ts";
import { loadSupiConfigSectionForScope, type SupiConfigOptions } from "./config.ts";

// ── Public types ───────────────────────────────────────────────────────────

export type ToolPromptSurfaceDiagnosticCode =
  | "invalidPromptSurfaceConfig"
  | "invalidPromptSurfaceField"
  | "projectPromptSurfaceIgnored";

export interface ToolPromptSurfaceDiagnostic {
  code: ToolPromptSurfaceDiagnosticCode;
  scope: "global" | "project";
  section: string;
  toolName: string;
  message: string;
}

export interface ResolveToolPromptSurfaceOptions extends SupiConfigOptions {
  section: string;
  toolName: string;
  defaults: SuiPiToolPromptSurface;
  ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">;
}

export interface ResolveToolPromptSurfaceResult {
  surface: SuiPiToolPromptSurface;
  diagnostics: ToolPromptSurfaceDiagnostic[];
}

// ── Private types ──────────────────────────────────────────────────────────

type PromptSurfaceField = keyof SuiPiToolPromptSurface;
type PromptSurfaceScope = ToolPromptSurfaceDiagnostic["scope"];

const PROMPT_SURFACE_FIELDS = new Set<string>(["description", "promptSnippet", "promptGuidelines"]);

const PROMPT_SURFACE_DIAGNOSTICS_KEY = Symbol.for(
  "@mrclrchtr/supi-core/tool-prompt-surface/notified-diagnostics",
);

// ── Resolution ─────────────────────────────────────────────────────────────

/** Resolve a tool's model-facing prompt surface from defaults + SuPi config overrides. */
export function resolveToolPromptSurface(
  options: ResolveToolPromptSurfaceOptions,
): ResolveToolPromptSurfaceResult {
  const diagnostics: ToolPromptSurfaceDiagnostic[] = [];
  let surface = clonePromptSurface(options.defaults);

  const globalSection = loadSupiConfigSectionForScope(options.section, options.ctx.cwd, {
    scope: "global",
    homeDir: options.homeDir,
  });
  surface = applyPromptSurfaceScope(surface, options, "global", globalSection, diagnostics);

  const projectSection = loadSupiConfigSectionForScope(options.section, options.ctx.cwd, {
    scope: "project",
    homeDir: options.homeDir,
  });
  const projectPromptSurface = getPromptSurfaceConfig(projectSection, options.toolName, {
    diagnostics,
    options,
    scope: "project",
  });

  if (projectPromptSurface) {
    const hasTrustMarker = hasTrustRequiringProjectResources(options.ctx.cwd);
    const projectTrusted = options.ctx.isProjectTrusted();
    if (hasTrustMarker && projectTrusted) {
      surface = applyPromptSurfaceConfig(
        surface,
        options.defaults,
        projectPromptSurface,
        options,
        "project",
        diagnostics,
      );
    } else {
      diagnostics.push({
        code: "projectPromptSurfaceIgnored",
        scope: "project",
        section: options.section,
        toolName: options.toolName,
        message: hasTrustMarker
          ? `Project prompt-surface overrides for ${options.toolName} were ignored because the project is not trusted in PI.`
          : `Project prompt-surface overrides for ${options.toolName} were ignored because ${options.ctx.cwd}/.pi/supi/config.json is not PI trust-gated. Add .pi/settings.json and trust the project to enable them.`,
      });
    }
  }

  return { surface, diagnostics };
}

/** Notify prompt-surface diagnostics once per session/tool/diagnostic code. */
export function notifyToolPromptSurfaceDiagnostics(
  ctx: Pick<ExtensionContext, "sessionManager" | "ui">,
  diagnostics: readonly ToolPromptSurfaceDiagnostic[],
): void {
  const globalRecord = globalThis as Record<symbol, Set<string> | undefined>;
  const notified = globalRecord[PROMPT_SURFACE_DIAGNOSTICS_KEY] ?? new Set<string>();
  globalRecord[PROMPT_SURFACE_DIAGNOSTICS_KEY] = notified;
  const sessionId = ctx.sessionManager.getSessionId();

  for (const diagnostic of diagnostics) {
    const key = `${sessionId}:${diagnostic.section}:${diagnostic.toolName}:${diagnostic.code}`;
    if (notified.has(key)) continue;
    notified.add(key);
    ctx.ui.notify(diagnostic.message, "warning");
  }
}

// ── Scope helpers ──────────────────────────────────────────────────────────

// biome-ignore lint/complexity/useMaxParams: resolver dispatch with diagnostics
function applyPromptSurfaceScope(
  current: SuiPiToolPromptSurface,
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  sectionConfig: Record<string, unknown> | null,
  diagnostics: ToolPromptSurfaceDiagnostic[],
): SuiPiToolPromptSurface {
  const promptSurface = getPromptSurfaceConfig(sectionConfig, options.toolName, {
    diagnostics,
    options,
    scope,
  });
  if (!promptSurface) return current;
  return applyPromptSurfaceConfig(
    current,
    options.defaults,
    promptSurface,
    options,
    scope,
    diagnostics,
  );
}

// biome-ignore lint/complexity/useMaxParams: per-scope config merger with diagnostics
function applyPromptSurfaceConfig(
  current: SuiPiToolPromptSurface,
  defaults: SuiPiToolPromptSurface,
  config: Record<string, unknown>,
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  diagnostics: ToolPromptSurfaceDiagnostic[],
): SuiPiToolPromptSurface {
  let next = clonePromptSurface(current);

  for (const field of getResetFields(config.$reset, options, scope, diagnostics)) {
    next = { ...next, [field]: clonePromptSurfaceField(defaults[field]) };
  }

  const description = getOptionalNonEmptyString(
    config.description,
    "description",
    options,
    scope,
    diagnostics,
  );
  if (description !== undefined) next.description = description;

  const promptSnippet = getOptionalNonEmptyString(
    config.promptSnippet,
    "promptSnippet",
    options,
    scope,
    diagnostics,
  );
  if (promptSnippet !== undefined) next.promptSnippet = promptSnippet;

  const promptGuidelines = getOptionalStringArray(
    config.promptGuidelines,
    "promptGuidelines",
    options,
    scope,
    diagnostics,
  );
  if (promptGuidelines !== undefined) next.promptGuidelines = promptGuidelines;

  const prepend = getOptionalStringArray(
    config.prependPromptGuidelines,
    "prependPromptGuidelines",
    options,
    scope,
    diagnostics,
  );
  if (prepend !== undefined) next.promptGuidelines = [...prepend, ...next.promptGuidelines];

  const append = getOptionalStringArray(
    config.appendPromptGuidelines,
    "appendPromptGuidelines",
    options,
    scope,
    diagnostics,
  );
  if (append !== undefined) next.promptGuidelines = [...next.promptGuidelines, ...append];

  return next;
}

// ── Config extraction ──────────────────────────────────────────────────────

function getPromptSurfaceConfig(
  sectionConfig: Record<string, unknown> | null,
  toolName: string,
  deps: {
    diagnostics: ToolPromptSurfaceDiagnostic[];
    options: ResolveToolPromptSurfaceOptions;
    scope: PromptSurfaceScope;
  },
): Record<string, unknown> | null {
  if (!sectionConfig) return null;
  if (sectionConfig.tools === undefined) return null;
  if (!isRecord(sectionConfig.tools)) {
    pushInvalidConfig(deps, "tools must be an object.");
    return null;
  }
  const toolConfig = sectionConfig.tools[toolName];
  if (toolConfig === undefined) return null;
  if (!isRecord(toolConfig)) {
    pushInvalidConfig(deps, `tools.${toolName} must be an object.`);
    return null;
  }
  if (toolConfig.promptSurface === undefined) return null;
  if (!isRecord(toolConfig.promptSurface)) {
    pushInvalidConfig(deps, `tools.${toolName}.promptSurface must be an object.`);
    return null;
  }
  return toolConfig.promptSurface;
}

// ── Field validation ───────────────────────────────────────────────────────

function getResetFields(
  value: unknown,
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  diagnostics: ToolPromptSurfaceDiagnostic[],
): PromptSurfaceField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    pushInvalidField(options, scope, diagnostics, "$reset", "must be an array.");
    return [];
  }
  const fields: PromptSurfaceField[] = [];
  for (const item of value) {
    if (typeof item === "string" && PROMPT_SURFACE_FIELDS.has(item)) {
      fields.push(item as PromptSurfaceField);
    } else {
      pushInvalidField(
        options,
        scope,
        diagnostics,
        "$reset",
        `contains unsupported field ${JSON.stringify(item)}.`,
      );
    }
  }
  return fields;
}

// biome-ignore lint/complexity/useMaxParams: validation helper with diagnostics
function getOptionalNonEmptyString(
  value: unknown,
  field: string,
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  diagnostics: ToolPromptSurfaceDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.length > 0) return value;
  pushInvalidField(options, scope, diagnostics, field, "must be a non-empty string.");
  return undefined;
}

// biome-ignore lint/complexity/useMaxParams: validation helper with diagnostics
function getOptionalStringArray(
  value: unknown,
  field: string,
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  diagnostics: ToolPromptSurfaceDiagnostic[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  pushInvalidField(options, scope, diagnostics, field, "must be an array of strings.");
  return undefined;
}

// ── Diagnostics ────────────────────────────────────────────────────────────

function pushInvalidConfig(
  deps: {
    diagnostics: ToolPromptSurfaceDiagnostic[];
    options: ResolveToolPromptSurfaceOptions;
    scope: PromptSurfaceScope;
  },
  detail: string,
): void {
  deps.diagnostics.push({
    // biome-ignore lint/security/noSecrets: false positive on string constant
    code: "invalidPromptSurfaceConfig",
    scope: deps.scope,
    section: deps.options.section,
    toolName: deps.options.toolName,
    message: `Invalid prompt-surface config for ${deps.options.section}.${deps.options.toolName}: ${detail}`,
  });
}

// biome-ignore lint/complexity/useMaxParams: diagnostics utility with many fields
function pushInvalidField(
  options: ResolveToolPromptSurfaceOptions,
  scope: PromptSurfaceScope,
  diagnostics: ToolPromptSurfaceDiagnostic[],
  field: string,
  detail: string,
): void {
  diagnostics.push({
    // biome-ignore lint/security/noSecrets: false positive on string constant
    code: "invalidPromptSurfaceField",
    scope,
    section: options.section,
    toolName: options.toolName,
    message: `Invalid prompt-surface field ${field} for ${options.section}.${options.toolName}: ${detail}`,
  });
}

// ── Cloning ────────────────────────────────────────────────────────────────

function clonePromptSurface(surface: SuiPiToolPromptSurface): SuiPiToolPromptSurface {
  return {
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: [...surface.promptGuidelines],
  };
}

function clonePromptSurfaceField<T extends string | string[]>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
