import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type BoolField,
  type EnumField,
  isSettingsContributionCollector,
  type ModelPickerField,
  type ScopedFieldValue,
  type SettingsAction,
  type SettingsModule,
  type SettingsScope,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { readCurrentProfileSources, resolveProfileDefinition } from "./profile-catalogue.ts";
import { removeProfileField, updateProfileJson } from "./profile-json.ts";
import { isCanonicalModel, type ProfileCandidate } from "./profile-validation.ts";
import type {
  AgentInstructionScope,
  AgentThinkingLevel,
  ProfileCatalogue,
  ProfileCatalogueEntry,
  ProfileDiagnostic,
  ProfileSource,
} from "./types.ts";

/** Pi thinking levels exposed by the profile settings rows. */
export const PROFILE_THINKING_LEVELS: readonly AgentThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

type ProfileSettingField = "enabled" | "model" | "thinking" | "instructionScopes";

/** Instruction row choices and the `instructionScopes` list each one persists. */
const INSTRUCTION_CHOICES: Readonly<Record<string, readonly AgentInstructionScope[]>> = {
  none: [],
  project: ["project"],
  global: ["global"],
  "global+project": ["global", "project"],
};

const ENABLED_FIELD: BoolField = {
  kind: "boolean",
  key: "enabled",
  label: "Enabled",
  description: "Enable this Agent Profile. Run /reload to apply changes.",
};

const MODEL_FIELD: ModelPickerField = {
  kind: "modelPicker",
  key: "model",
  label: "Model",
  staticOptions: [{ value: "", label: "Inherit from session" }],
  includeDisabled: false,
};

const THINKING_FIELD: EnumField = {
  kind: "enum",
  key: "thinking",
  label: "Thinking",
  values: [...PROFILE_THINKING_LEVELS],
};

const INSTRUCTIONS_FIELD: EnumField = {
  kind: "enum",
  key: "instructionScopes",
  label: "Instructions",
  description:
    "Which AGENTS.md or CLAUDE.md files Agent Runs of this profile load. Run /reload to apply changes.",
  values: Object.keys(INSTRUCTION_CHOICES),
};

/** Register one dynamic settings contribution per discovered Profile ID. */
export function registerProfileSettings(pi: ExtensionAPI, catalogue: ProfileCatalogue): () => void {
  const modules = createProfileSettingsSections(catalogue);
  return pi.events.on(SUPI_SETTINGS_COLLECT_EVENT, (collector) => {
    if (!isSettingsContributionCollector(collector)) return;
    for (const module of modules) collector.add(module);
  });
}

/** Build the profile settings modules for one immutable catalogue snapshot. */
export function createProfileSettingsSections(
  catalogue: ProfileCatalogue,
): readonly SettingsModule[] {
  return catalogue.profiles.map((entry) => createProfileSettingsSection(entry, catalogue));
}

/** Build one Profile ID's Enabled, Model, Thinking, and Instructions settings module. */
export function createProfileSettingsSection(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
): SettingsModule {
  return {
    id: `agent-profile-${entry.id}`,
    label: "Agent",
    subsection: entry.id,
    read: async ({ scope }) => ({ rows: loadProfileSettings(entry, catalogue, scope) }),
    apply: async ({ scope, fieldKey, action }) => {
      if (!isProfileSettingField(fieldKey)) return {};
      persistProfileField({ entry, catalogue, scope, field: fieldKey, action });
      // Only Model and Thinking are read again for the next Agent Run.
      return fieldKey === "enabled" || fieldKey === "instructionScopes"
        ? {
            notice: {
              message: "Profile setting saved. Run /reload to apply this change.",
              level: "info",
            },
          }
        : {};
    },
  };
}

function loadProfileSettings(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
  scope: SettingsScope,
): ScopedFieldValue[] {
  const resolved = resolveProfileSettings(entry, catalogue, scope);
  const diagnostics = [...resolved.diagnostics];
  const definition = resolveProfileDefinition(entry);
  if ("code" in definition) diagnostics.push(definition);
  const values: ScopedFieldValue[] = [
    settingValue(
      ENABLED_FIELD,
      resolved.enabled,
      resolved.enabledSource,
      resolved.enabledInheritanceSource,
    ),
    settingValue(
      MODEL_FIELD,
      resolved.model,
      resolved.modelSource,
      resolved.modelInheritanceSource,
    ),
    settingValue(
      THINKING_FIELD,
      resolved.thinking,
      resolved.thinkingSource,
      resolved.thinkingInheritanceSource,
    ),
  ];
  // An incomplete profile has no instruction policy to show; its diagnostic row explains why.
  if (resolved.instructions !== undefined) {
    values.push(
      settingValue(
        INSTRUCTIONS_FIELD,
        resolved.instructions,
        resolved.instructionsSource,
        resolved.instructionsInheritanceSource,
      ),
    );
  }

  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    values.push({
      field: diagnosticField,
      displayValue: diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("; "),
      editValue: "",
      source: diagnosticSource(first?.source),
    });
  }
  return values;
}

const diagnosticField = {
  kind: "custom" as const,
  key: "diagnostic",
  label: "Diagnostic",
  resolve: () => ({ displayValue: "", source: "default" as const }),
  persist: () => {},
};

function settingValue(
  field: BoolField | ModelPickerField | EnumField,
  value: string | boolean | undefined,
  source: "project" | "global" | "default",
  inheritanceSource?: "global" | "default",
): ScopedFieldValue {
  const editValue = typeof value === "boolean" ? (value ? "on" : "off") : (value ?? "");
  return {
    field,
    displayValue: `${editValue || "Inherit from session"} (${source})`,
    editValue,
    source,
    inheritanceSource,
  };
}

function resolveProfileSettings(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
  scope: SettingsScope,
): {
  enabled: boolean;
  model?: string;
  thinking?: AgentThinkingLevel;
  enabledSource: "project" | "global" | "default";
  modelSource: "project" | "global" | "default";
  thinkingSource: "project" | "global" | "default";
  enabledInheritanceSource?: "global" | "default";
  modelInheritanceSource?: "global" | "default";
  thinkingInheritanceSource?: "global" | "default";
  instructions?: string;
  instructionsSource: "project" | "global" | "default";
  instructionsInheritanceSource?: "global" | "default";
  diagnostics: ProfileDiagnostic[];
} {
  const candidates = readCurrentProfileSources(entry.id, catalogue.sourceDirectories).filter(
    (candidate) => applicableSources(scope).includes(candidate.source),
  );
  const diagnostics = candidates.flatMap((candidate) =>
    candidate.diagnostic ? [candidate.diagnostic] : [],
  );

  const enabled = resolveSetting(candidates, "enabled");
  const model = resolveSetting(candidates, "model");
  const thinking = resolveSetting(candidates, "thinking");
  const instructions = resolveSetting(candidates, "instructionScopes");
  return {
    instructions: instructionChoice(instructions?.value),
    instructionsSource: toSettingsSource(instructions?.candidate.source),
    instructionsInheritanceSource: inheritanceSource(
      candidates,
      "instructionScopes",
      instructions?.candidate.source,
    ),
    enabled: enabled?.value !== false,
    enabledSource: toSettingsSource(enabled?.candidate.source),
    enabledInheritanceSource: inheritanceSource(candidates, "enabled", enabled?.candidate.source),
    model: typeof model?.value === "string" ? model.value : undefined,
    thinking: isThinkingLevel(thinking?.value) ? thinking.value : undefined,
    modelSource: toSettingsSource(model?.candidate.source),
    thinkingSource: toSettingsSource(thinking?.candidate.source),
    modelInheritanceSource: inheritanceSource(candidates, "model", model?.candidate.source),
    thinkingInheritanceSource: inheritanceSource(
      candidates,
      "thinking",
      thinking?.candidate.source,
    ),
    diagnostics,
  };
}

function applicableSources(scope: SettingsScope): readonly ProfileSource[] {
  return scope === "project" ? ["package", "global", "project"] : ["package", "global"];
}

function sourceRoot(catalogue: ProfileCatalogue, source: ProfileSource): string | undefined {
  return catalogue.sourceDirectories[source];
}

function resolveSetting(
  candidates: readonly ProfileCandidate[],
  field: ProfileSettingField,
): { value: unknown; candidate: ProfileCandidate } | undefined {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate || candidate.diagnostic || !candidate.manifest) continue;
    if (Object.hasOwn(candidate.manifest, field)) {
      return { value: candidate.manifest[field], candidate };
    }
  }
  return undefined;
}

function toSettingsSource(source: ProfileSource | undefined): "project" | "global" | "default" {
  return source === "project" || source === "global" ? source : "default";
}

function inheritanceSource(
  candidates: readonly ProfileCandidate[],
  field: ProfileSettingField,
  source: ProfileSource | undefined,
): "global" | "default" | undefined {
  if (source !== "project") return undefined;
  const fallback = resolveSetting(
    candidates.filter((candidate) => candidate.source !== "project"),
    field,
  );
  return fallback?.candidate.source === "global" ? "global" : "default";
}

function diagnosticSource(source: ProfileSource | undefined): "project" | "global" | "default" {
  return toSettingsSource(source);
}

function formatDiagnostic(diagnostic: ProfileDiagnostic): string {
  return `${diagnostic.source}: ${diagnostic.message}`;
}

function persistProfileField(options: {
  entry: ProfileCatalogueEntry;
  catalogue: ProfileCatalogue;
  scope: SettingsScope;
  field: ProfileSettingField;
  action: SettingsAction;
}): void {
  const { entry, catalogue, scope, field, action } = options;
  const directory = writableProfileDirectory(entry, catalogue, scope);
  if (!directory) throw new Error("Project profile directory is unavailable.");

  if (action.kind === "set" && !(field === "model" && action.value === "")) {
    validateSettingValue(field, action.value);
    updateProfileJson(directory, field, persistedValue(field, action.value));
    return;
  }
  removeProfileField(directory, field);
}

function writableProfileDirectory(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
  scope: SettingsScope,
): string | undefined {
  const root = sourceRoot(catalogue, scope);
  return root ? join(root, entry.id) : undefined;
}

function persistedValue(field: ProfileSettingField, value: string): string | boolean | string[] {
  if (field === "enabled") return value === "on";
  if (field === "instructionScopes") return [...(INSTRUCTION_CHOICES[value] ?? [])];
  return value;
}

function validateSettingValue(field: ProfileSettingField, value: string): void {
  if (field === "instructionScopes") {
    if (!Object.hasOwn(INSTRUCTION_CHOICES, value)) {
      throw new Error("Instructions must be none, project, global, or global+project.");
    }
    return;
  }
  if (field === "enabled") {
    if (value !== "on" && value !== "off") throw new Error("Enabled must be on or off.");
    return;
  }
  if (field === "thinking") {
    if (!isThinkingLevel(value)) throw new Error("Thinking is not a supported Pi thinking level.");
    return;
  }
  if (!isCanonicalModel(value)) {
    throw new Error("Model must use the canonical provider/model-id form.");
  }
}

function isProfileSettingField(key: string): key is ProfileSettingField {
  return key === "enabled" || key === "model" || key === "thinking" || key === "instructionScopes";
}

/** Name the row choice for a stored scope list, in any order. */
function instructionChoice(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return Object.keys(INSTRUCTION_CHOICES).find((choice) => {
    const scopes = INSTRUCTION_CHOICES[choice] ?? [];
    return scopes.length === value.length && scopes.every((scope) => value.includes(scope));
  });
}

function isThinkingLevel(value: unknown): value is AgentThinkingLevel {
  return PROFILE_THINKING_LEVELS.includes(value as AgentThinkingLevel);
}
