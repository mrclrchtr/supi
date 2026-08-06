import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type EnumField,
  isSettingsContributionCollector,
  type ModelPickerField,
  type ScopedFieldValue,
  type SettingsFieldAction,
  type SettingsScope,
  type SettingsSection,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { resolveProfileDefinition } from "./profile-catalogue.ts";
import {
  isCanonicalModel,
  type ProfileCandidate,
  validateProfileDirectory,
} from "./profile-validation.ts";
import type {
  AgentThinkingLevel,
  ProfileCatalogue,
  ProfileCatalogueEntry,
  ProfileDiagnostic,
  ProfileSource,
} from "./types.ts";

/** PI thinking levels exposed by the profile settings rows. */
export const PROFILE_THINKING_LEVELS: readonly AgentThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

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

/** Register one dynamic settings contribution per discovered Profile ID. */
export function registerProfileSettings(pi: ExtensionAPI, catalogue: ProfileCatalogue): () => void {
  const sections = createProfileSettingsSections(catalogue);
  return pi.events.on(SUPI_SETTINGS_COLLECT_EVENT, (collector) => {
    if (!isSettingsContributionCollector(collector)) return;
    for (const section of sections) collector.add(section);
  });
}

/** Build the profile settings sections for one immutable catalogue snapshot. */
export function createProfileSettingsSections(
  catalogue: ProfileCatalogue,
): readonly SettingsSection[] {
  return catalogue.profiles.map((entry) => createProfileSettingsSection(entry, catalogue));
}

/** Build one Profile ID's Model and Thinking settings section. */
export function createProfileSettingsSection(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
): SettingsSection {
  return {
    id: `agent-profile-${entry.id}`,
    label: `Agent ${entry.id}`,
    loadValues: (scope) => loadProfileSettings(entry, catalogue, scope),
    handleAction: (scope, _cwd, fieldKey, action) => {
      if (fieldKey !== "model" && fieldKey !== "thinking") return;
      persistProfileField({ entry, catalogue, scope, field: fieldKey, action });
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
  field: ModelPickerField | EnumField,
  value: string | undefined,
  source: "project" | "global" | "default",
  inheritanceSource?: "global" | "default",
): ScopedFieldValue {
  const displayValue = value ?? "Inherit from session";
  return {
    field,
    displayValue: `${displayValue} (${source})`,
    editValue: value ?? "",
    source,
    inheritanceSource,
  };
}

function resolveProfileSettings(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
  scope: SettingsScope,
): {
  model?: string;
  thinking?: AgentThinkingLevel;
  modelSource: "project" | "global" | "default";
  thinkingSource: "project" | "global" | "default";
  modelInheritanceSource?: "global" | "default";
  thinkingInheritanceSource?: "global" | "default";
  diagnostics: ProfileDiagnostic[];
} {
  const candidates: ProfileCandidate[] = [];
  const diagnostics: ProfileDiagnostic[] = [];
  for (const source of applicableSources(scope)) {
    const candidate = readSourceCandidate(entry, catalogue, source);
    if (!candidate) continue;
    candidates.push(candidate);
    if (candidate.diagnostic) diagnostics.push(candidate.diagnostic);
  }

  const model = resolveSetting(candidates, "model");
  const thinking = resolveSetting(candidates, "thinking");
  return {
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

function readSourceCandidate(
  entry: ProfileCatalogueEntry,
  catalogue: ProfileCatalogue,
  source: ProfileSource,
): ProfileCandidate | undefined {
  const root = sourceRoot(catalogue, source);
  if (!root) return undefined;
  const directory = entry.sources.find((candidate) => candidate.source === source)?.directory;
  const profileDirectory = directory ?? join(root, entry.id);
  if (!existsSync(profileDirectory)) return undefined;
  return validateProfileDirectory(source, profileDirectory);
}

function sourceRoot(catalogue: ProfileCatalogue, source: ProfileSource): string | undefined {
  switch (source) {
    case "package":
      return catalogue.sourceDirectories.package;
    case "global":
      return catalogue.sourceDirectories.global;
    case "project":
      return catalogue.sourceDirectories.project;
  }
}

function resolveSetting(
  candidates: readonly ProfileCandidate[],
  field: "model" | "thinking",
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
  field: "model" | "thinking",
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
  field: "model" | "thinking";
  action: SettingsFieldAction;
}): void {
  const { entry, catalogue, scope, field, action } = options;
  const directory = writableProfileDirectory(entry, catalogue, scope);
  if (!directory) throw new Error("Project profile directory is unavailable.");

  if (action.kind === "set" && !(field === "model" && action.value === "")) {
    validateSettingValue(field, action.value);
    updateProfileJson(directory, field, action.value);
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

function validateSettingValue(field: "model" | "thinking", value: string): void {
  if (field === "thinking") {
    if (!isThinkingLevel(value)) throw new Error("Thinking is not a supported PI thinking level.");
    return;
  }
  if (!isCanonicalModel(value)) {
    throw new Error("Model must use the canonical provider/model-id form.");
  }
}

function updateProfileJson(directory: string, field: "model" | "thinking", value: string): void {
  const data = readProfileJson(directory);
  mkdirSync(directory, { recursive: true });
  data[field] = value;
  writeFileSync(join(directory, "profile.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function removeProfileField(directory: string, field: "model" | "thinking"): void {
  const profilePath = join(directory, "profile.json");
  if (!existsSync(profilePath)) return;
  const data = readProfileJson(directory);
  delete data[field];
  if (Object.keys(data).length === 0) {
    unlinkSync(profilePath);
    if (readdirSync(directory).length === 0) rmdirSync(directory);
    return;
  }
  writeFileSync(profilePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readProfileJson(directory: string): Record<string, unknown> {
  const path = join(directory, "profile.json");
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error("profile.json is not valid JSON.", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("profile.json must contain an object.");
  }
  return parsed as Record<string, unknown>;
}

function isThinkingLevel(value: unknown): value is AgentThinkingLevel {
  return PROFILE_THINKING_LEVELS.includes(value as AgentThinkingLevel);
}
