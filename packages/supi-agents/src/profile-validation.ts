import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentCapability } from "./capabilities.ts";
import {
  type AgentProfile,
  type AgentProfileManifest,
  type AgentSystemPrompt,
  type AgentThinkingLevel,
  MAX_CUSTOM_SYSTEM_PROMPT_CHARS,
  MAX_PROFILE_DESCRIPTION_LENGTH,
  MAX_PROFILE_DIAGNOSTIC_CHARS,
  MAX_PROFILE_ID_LENGTH,
  MAX_PROFILE_MODEL_REFERENCE_CHARS,
  type ProfileDiagnostic,
  type ProfileSource,
} from "./types.ts";

const PROFILE_ID_PATTERN = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;
const THINKING_LEVELS = new Set<AgentThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const PACKAGE_PROMPT_IDS = new Set<AgentSystemPrompt>(["supi:explore", "supi:general"]);

/** Candidate profile, including an unavailable higher-precedence definition. */
export interface ProfileCandidate {
  readonly id: string;
  readonly source: ProfileSource;
  readonly directory: string;
  readonly profile?: AgentProfile;
  readonly diagnostic?: ProfileDiagnostic;
}

/** Validate one self-contained Profile Directory without falling back to another source. */
export function validateProfileDirectory(
  source: ProfileSource,
  directory: string,
): ProfileCandidate {
  const id = basename(directory);
  const identityError = validateProfileId(id);
  if (identityError)
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-profile-id",
      message: identityError,
    });

  const manifestPath = join(directory, "profile.json");
  if (!existsSync(manifestPath) || !isFile(manifestPath)) {
    return invalidCandidate({
      id,
      source,
      directory,
      code: "missing-profile-manifest",
      message: "profile.json is missing.",
    });
  }

  const raw = readJson(manifestPath);
  if (!raw.ok)
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-manifest",
      message: raw.message,
    });

  const manifest = validateManifest(raw.value);
  if (!manifest.ok)
    return invalidCandidate({
      id,
      source,
      directory,
      code: manifest.code,
      message: manifest.message,
    });

  const customPrompt = readCustomPrompt(directory, manifest.value.systemPrompt);
  if (!customPrompt.ok)
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-prompt",
      message: customPrompt.message,
    });

  return {
    id,
    source,
    directory,
    profile: Object.freeze({
      id,
      source,
      directory,
      manifest: manifest.value,
      ...(customPrompt.value === undefined ? {} : { customSystemPrompt: customPrompt.value }),
    }),
  };
}

/** Create a bounded diagnostic for profile/configuration output. */
export function makeDiagnostic(
  profileId: string,
  source: ProfileSource,
  code: ProfileDiagnostic["code"],
  message: string,
): ProfileDiagnostic {
  return Object.freeze({
    profileId: sanitizeDiagnosticText(profileId).slice(0, MAX_PROFILE_ID_LENGTH) || "(invalid)",
    source,
    code,
    message: sanitizeDiagnosticText(message).slice(0, MAX_PROFILE_DIAGNOSTIC_CHARS),
  });
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(
      /\b(?:token|password|passwd|secret|api[_-]?key|authorization|credential)\s*[:=]\s*[^\s]+/gi,
      "[REDACTED]",
    )
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateProfileId(id: string): string | undefined {
  return PROFILE_ID_PATTERN.test(id) && id.length <= MAX_PROFILE_ID_LENGTH
    ? undefined
    : "Profile ID must start with a letter, use lowercase kebab-case, and be at most 64 characters.";
}

function invalidCandidate(options: {
  readonly id: string;
  readonly source: ProfileSource;
  readonly directory: string;
  readonly code: ProfileDiagnostic["code"];
  readonly message: string;
}): ProfileCandidate {
  return {
    id: options.id,
    source: options.source,
    directory: options.directory,
    diagnostic: makeDiagnostic(options.id, options.source, options.code, options.message),
  };
}

function readJson(
  path: string,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return { ok: false, message: "profile.json is not valid JSON." };
  }
}

function validateManifest(value: unknown):
  | { readonly ok: true; readonly value: AgentProfileManifest }
  | {
      readonly ok: false;
      readonly code: "invalid-manifest" | "invalid-prompt";
      readonly message: string;
    } {
  if (!isRecord(value)) return invalidManifest("Manifest must be an object.");
  const unknownField = Object.keys(value).find((key) => !ALLOWED_FIELDS.has(key));
  if (unknownField) return invalidManifest("Manifest contains an unknown field.");

  const basic = validateBasicFields(value);
  if (basic) return basic;
  const prompt = validatePrompt(value.systemPrompt);
  if (prompt) return prompt;
  const scopes = validateInstructionScopes(value.instructionScopes);
  if (scopes) return scopes;
  const optional = validateOptionalFields(value);
  if (optional) return optional;

  return {
    ok: true,
    value: Object.freeze({
      description: (value.description as string).trim(),
      tools: Object.freeze([...(value.tools as string[])]) as AgentProfileManifest["tools"],
      systemPrompt: value.systemPrompt as AgentSystemPrompt,
      instructionScopes: Object.freeze([
        ...(value.instructionScopes as string[]),
      ]) as AgentProfileManifest["instructionScopes"],
      ...(value.model === undefined ? {} : { model: value.model as string }),
      ...(value.thinking === undefined ? {} : { thinking: value.thinking as AgentThinkingLevel }),
      ...(value.timeoutMinutes === undefined
        ? {}
        : { timeoutMinutes: value.timeoutMinutes as number }),
    }),
  };
}

const ALLOWED_FIELDS = new Set([
  "description",
  "tools",
  "systemPrompt",
  "instructionScopes",
  "model",
  "thinking",
  "timeoutMinutes",
]);

function validateBasicFields(
  value: Record<string, unknown>,
): { readonly ok: false; readonly code: "invalid-manifest"; readonly message: string } | undefined {
  if (
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    value.description.length > MAX_PROFILE_DESCRIPTION_LENGTH
  ) {
    return invalidManifest("description must be non-empty and at most 200 characters.");
  }
  if (!Array.isArray(value.tools) || value.tools.some((tool) => typeof tool !== "string")) {
    return invalidManifest("tools must be an array of capability IDs.");
  }
  if (
    new Set(value.tools).size !== value.tools.length ||
    value.tools.some((tool) => !getAgentCapability(tool))
  ) {
    return invalidManifest("tools contains an unknown or duplicate capability.");
  }
  return undefined;
}

function validatePrompt(
  value: unknown,
): { readonly ok: false; readonly code: "invalid-prompt"; readonly message: string } | undefined {
  return isSystemPrompt(value)
    ? undefined
    : {
        ok: false,
        code: "invalid-prompt",
        message: "systemPrompt must select native, supi:explore, supi:general, or custom.",
      };
}

function validateInstructionScopes(
  value: unknown,
): { readonly ok: false; readonly code: "invalid-manifest"; readonly message: string } | undefined {
  if (!Array.isArray(value) || value.some((scope) => scope !== "global" && scope !== "project")) {
    return invalidManifest("instructionScopes must contain only global and project.");
  }
  return new Set(value).size === value.length
    ? undefined
    : invalidManifest("instructionScopes must not contain duplicates.");
}

function validateOptionalFields(
  value: Record<string, unknown>,
): { readonly ok: false; readonly code: "invalid-manifest"; readonly message: string } | undefined {
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" ||
      value.model.length > MAX_PROFILE_MODEL_REFERENCE_CHARS ||
      !isCanonicalModel(value.model))
  ) {
    return invalidManifest("model must use the canonical provider/model-id form.");
  }
  if (
    value.thinking !== undefined &&
    (typeof value.thinking !== "string" ||
      !THINKING_LEVELS.has(value.thinking as AgentThinkingLevel))
  ) {
    return invalidManifest("thinking is not a supported PI thinking level.");
  }
  if (
    value.timeoutMinutes !== undefined &&
    (typeof value.timeoutMinutes !== "number" ||
      !Number.isInteger(value.timeoutMinutes) ||
      value.timeoutMinutes < 1 ||
      value.timeoutMinutes > 240)
  ) {
    return invalidManifest("timeoutMinutes must be an integer from 1 through 240.");
  }
  return undefined;
}

function invalidManifest(message: string): {
  readonly ok: false;
  readonly code: "invalid-manifest";
  readonly message: string;
} {
  return { ok: false, code: "invalid-manifest", message };
}

function readCustomPrompt(
  directory: string,
  selector: AgentSystemPrompt,
):
  | { readonly ok: true; readonly value?: string }
  | { readonly ok: false; readonly message: string } {
  if (selector !== "custom") return { ok: true };
  const path = join(directory, "SYSTEM.md");
  if (!existsSync(path) || !isFile(path)) {
    return { ok: false, message: "systemPrompt=custom requires a sibling SYSTEM.md file." };
  }
  try {
    const content = readFileSync(path, "utf8");
    return content.trim().length > 0 && content.length <= MAX_CUSTOM_SYSTEM_PROMPT_CHARS
      ? { ok: true, value: content }
      : { ok: false, message: "SYSTEM.md must be non-empty and at most 32,000 characters." };
  } catch {
    return { ok: false, message: "SYSTEM.md could not be read." };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSystemPrompt(value: unknown): value is AgentSystemPrompt {
  return (
    value === "native" || value === "custom" || PACKAGE_PROMPT_IDS.has(value as AgentSystemPrompt)
  );
}

function isCanonicalModel(value: string): boolean {
  const slash = value.indexOf("/");
  return (
    slash > 0 &&
    slash < value.length - 1 &&
    !/\s/.test(value.slice(0, slash)) &&
    !/\s/.test(value.slice(slash + 1))
  );
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
