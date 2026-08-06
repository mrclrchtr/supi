import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentCapability } from "./capabilities.ts";
import {
  type AgentProfileManifest,
  type AgentSystemPrompt,
  type AgentThinkingLevel,
  MAX_CUSTOM_SYSTEM_PROMPT_CHARS,
  MAX_PROFILE_DESCRIPTION_LENGTH,
  MAX_PROFILE_DIAGNOSTIC_CHARS,
  MAX_PROFILE_ID_LENGTH,
  MAX_PROFILE_MODEL_REFERENCE_CHARS,
  type PartialAgentProfileManifest,
  PROFILE_MANIFEST_FIELDS,
  type ProfileDiagnostic,
  type ProfileSource,
  type ProfileSourceEntry,
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
const ALLOWED_FIELDS = new Set<keyof AgentProfileManifest>(PROFILE_MANIFEST_FIELDS);

/** Candidate profile source, including an unavailable source diagnostic. */
export type ProfileCandidate = ProfileSourceEntry;

/** Validate one profile source as a partial manifest. */
export function validateProfileDirectory(
  source: ProfileSource,
  directory: string,
): ProfileCandidate {
  const id = basename(directory);
  const identityError = validateProfileId(id);
  if (identityError) {
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-profile-id",
      message: identityError,
    });
  }

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
  if (!raw.ok) {
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-manifest",
      message: raw.message,
    });
  }

  const manifest = validateManifest(raw.value);
  if (!manifest.ok) {
    return invalidCandidate({
      id,
      source,
      directory,
      code: manifest.code,
      message: manifest.message,
    });
  }

  const customPrompt = readCustomPrompt(directory, manifest.value.systemPrompt);
  if (!customPrompt.ok) {
    return invalidCandidate({
      id,
      source,
      directory,
      code: "invalid-prompt",
      message: customPrompt.message,
    });
  }

  return Object.freeze({
    id,
    source,
    directory,
    manifest: manifest.value,
    ...(customPrompt.value === undefined ? {} : { customSystemPrompt: customPrompt.value }),
  });
}

/** Create a bounded diagnostic for profile/configuration output. */
// biome-ignore lint/complexity/useMaxParams: diagnostics are a small public boundary with stable positional fields.
export function makeDiagnostic(
  profileId: string,
  source: ProfileSource,
  code: ProfileDiagnostic["code"],
  message: string,
  directory?: string,
): ProfileDiagnostic {
  return Object.freeze({
    profileId: sanitizeDiagnosticText(profileId).slice(0, MAX_PROFILE_ID_LENGTH) || "(invalid)",
    source,
    code,
    message: sanitizeDiagnosticText(message).slice(0, MAX_PROFILE_DIAGNOSTIC_CHARS),
    ...(directory === undefined ? {} : { directory }),
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
  const diagnostic = makeDiagnostic(
    options.id,
    options.source,
    options.code,
    options.message,
    options.directory,
  );
  return Object.freeze({
    id: options.id,
    source: options.source,
    directory: options.directory,
    diagnostic,
  });
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
  | { readonly ok: true; readonly value: PartialAgentProfileManifest }
  | {
      readonly ok: false;
      readonly code: "invalid-manifest" | "invalid-prompt";
      readonly message: string;
    } {
  if (!isRecord(value)) return invalidManifest("Manifest must be an object.");
  const unknownField = Object.keys(value).find(
    (key) => !ALLOWED_FIELDS.has(key as keyof AgentProfileManifest),
  );
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
      ...(hasOwn(value, "description")
        ? { description: (value.description as string).trim() }
        : {}),
      ...(hasOwn(value, "tools")
        ? {
            tools: Object.freeze([...(value.tools as string[])]) as AgentProfileManifest["tools"],
          }
        : {}),
      ...(hasOwn(value, "systemPrompt")
        ? { systemPrompt: value.systemPrompt as AgentSystemPrompt }
        : {}),
      ...(hasOwn(value, "instructionScopes")
        ? {
            instructionScopes: Object.freeze([
              ...(value.instructionScopes as string[]),
            ]) as AgentProfileManifest["instructionScopes"],
          }
        : {}),
      ...(hasOwn(value, "model") ? { model: value.model as string } : {}),
      ...(hasOwn(value, "thinking") ? { thinking: value.thinking as AgentThinkingLevel } : {}),
      ...(hasOwn(value, "timeoutMinutes")
        ? { timeoutMinutes: value.timeoutMinutes as number }
        : {}),
    }),
  };
}

function validateBasicFields(
  value: Record<string, unknown>,
): { readonly ok: false; readonly code: "invalid-manifest"; readonly message: string } | undefined {
  if (
    hasOwn(value, "description") &&
    (typeof value.description !== "string" ||
      value.description.trim().length === 0 ||
      value.description.length > MAX_PROFILE_DESCRIPTION_LENGTH)
  ) {
    return invalidManifest("description must be non-empty and at most 200 characters.");
  }
  if (hasOwn(value, "tools")) {
    if (!Array.isArray(value.tools) || value.tools.some((tool) => typeof tool !== "string")) {
      return invalidManifest("tools must be an array of capability IDs.");
    }
    if (
      new Set(value.tools).size !== value.tools.length ||
      value.tools.some((tool) => !getAgentCapability(tool))
    ) {
      return invalidManifest("tools contains an unknown or duplicate capability.");
    }
  }
  return undefined;
}

function validatePrompt(
  value: unknown,
): { readonly ok: false; readonly code: "invalid-prompt"; readonly message: string } | undefined {
  if (value === undefined) return undefined;
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
  if (value === undefined) return undefined;
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
    hasOwn(value, "model") &&
    (typeof value.model !== "string" || !isCanonicalModel(value.model))
  ) {
    return invalidManifest("model must use the canonical provider/model-id form.");
  }
  if (
    hasOwn(value, "thinking") &&
    (typeof value.thinking !== "string" ||
      !THINKING_LEVELS.has(value.thinking as AgentThinkingLevel))
  ) {
    return invalidManifest("thinking is not a supported PI thinking level.");
  }
  if (
    hasOwn(value, "timeoutMinutes") &&
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
  selector: AgentSystemPrompt | undefined,
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

/** Return whether a model reference uses the bounded provider/model-id form. */
export function isCanonicalModel(value: string): boolean {
  const slash = value.indexOf("/");
  return (
    value.length <= MAX_PROFILE_MODEL_REFERENCE_CHARS &&
    slash > 0 &&
    slash < value.length - 1 &&
    !/\s/.test(value.slice(0, slash)) &&
    !/\s/.test(value.slice(slash + 1))
  );
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
