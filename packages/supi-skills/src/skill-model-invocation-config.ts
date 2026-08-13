import {
  loadSupiConfigSectionForScope,
  replaceSupiConfigSection,
} from "@mrclrchtr/supi-core/config";
import type { SettingsScope, ValueSource } from "@mrclrchtr/supi-core/settings";

const CONFIG_SECTION = "skills";
const MODEL_INVOCATION_KEY = "modelInvocation";
const SCHEMA_VERSION_KEY = "$schemaVersion";
const SCHEMA_VERSION = 2;
const LEGACY_MODEL_INVOCATION_KEY = "$legacyModelInvocation";
const INVALID_MODEL_INVOCATION_KEY = "$invalidModelInvocation";

/** Persisted Model Invocation states for one skill. */
export type ModelInvocationState = "enabled" | "disabled";

type SkillConfigRecord = Record<string, unknown>;

interface InvocationOptions {
  name: string;
  scope: SettingsScope;
  cwd: string;
  homeDir?: string;
}

interface ResolveInvocationOptions extends InvocationOptions {
  sourceDefault: boolean;
  projectTrusted: boolean;
}

interface ParsedInvocationConfig {
  section: SkillConfigRecord;
  records: Map<string, SkillConfigRecord>;
  invalidRecords: Map<string, unknown>;
  legacy: Map<string, unknown>;
  legacyMapKeys: Set<string>;
  invalidNames: Set<string>;
}

interface InvocationConfigSet {
  global: ParsedInvocationConfig;
  project?: ParsedInvocationConfig;
}

function isRecord(value: unknown): value is SkillConfigRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function setOwn(target: SkillConfigRecord, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function cloneRecord(value: SkillConfigRecord): SkillConfigRecord {
  return Object.fromEntries(Object.entries(value));
}

function isModelInvocationState(value: unknown): value is ModelInvocationState {
  return value === "enabled" || value === "disabled";
}

function legacyState(value: unknown): ModelInvocationState | undefined {
  if (typeof value !== "boolean") return undefined;
  return value ? "disabled" : "enabled";
}

/** An unversioned `modelInvocation` object is always the old boolean map. */
function isLegacyMapCandidate(value: unknown): value is SkillConfigRecord {
  return isRecord(value);
}

function addInvalidName(config: ParsedInvocationConfig, name: string): void {
  config.invalidNames.add(name);
}

function parseLegacyMap(
  config: ParsedInvocationConfig,
  key: string,
  value: SkillConfigRecord,
): void {
  config.legacyMapKeys.add(key);
  for (const [skillName, skillValue] of Object.entries(value)) {
    config.legacy.set(skillName, skillValue);
    if (legacyState(skillValue) === undefined) addInvalidName(config, skillName);
  }
}

function parseRecord(config: ParsedInvocationConfig, name: string, value: unknown): void {
  if (!isRecord(value)) {
    config.invalidRecords.set(name, value);
    addInvalidName(config, name);
    return;
  }

  const record = cloneRecord(value);
  config.records.set(name, record);
  const state = record[MODEL_INVOCATION_KEY];
  if (
    hasOwn(record, MODEL_INVOCATION_KEY) &&
    (!isModelInvocationState(state) || record[INVALID_MODEL_INVOCATION_KEY] === true)
  ) {
    addInvalidName(config, name);
  }
}

function parseInvocationConfig(section: Record<string, unknown> | null): ParsedInvocationConfig {
  const parsed: ParsedInvocationConfig = {
    section: section ? cloneRecord(section) : {},
    records: new Map(),
    invalidRecords: new Map(),
    legacy: new Map(),
    legacyMapKeys: new Set(),
    invalidNames: new Set(),
  };
  const versioned = parsed.section[SCHEMA_VERSION_KEY] === SCHEMA_VERSION;

  for (const [name, value] of Object.entries(parsed.section)) {
    if (name === SCHEMA_VERSION_KEY) continue;
    if (name === LEGACY_MODEL_INVOCATION_KEY) {
      if (isRecord(value)) parseLegacyMap(parsed, name, value);
      else addInvalidName(parsed, name);
      continue;
    }
    if (name === MODEL_INVOCATION_KEY && !versioned && isLegacyMapCandidate(value)) {
      parseLegacyMap(parsed, name, value);
      continue;
    }
    parseRecord(parsed, name, value);
  }

  return parsed;
}

function readInvocationConfig(
  scope: SettingsScope,
  cwd: string,
  homeDir?: string,
): ParsedInvocationConfig {
  return parseInvocationConfig(
    loadSupiConfigSectionForScope(CONFIG_SECTION, cwd, { scope, homeDir }),
  );
}

function readInvocationConfigs(
  cwd: string,
  projectTrusted: boolean,
  homeDir?: string,
): InvocationConfigSet {
  return {
    global: readInvocationConfig("global", cwd, homeDir),
    ...(projectTrusted ? { project: readInvocationConfig("project", cwd, homeDir) } : {}),
  };
}

function stateFromConfig(
  config: ParsedInvocationConfig,
  name: string,
): ModelInvocationState | undefined {
  const record = config.records.get(name);
  if (
    record &&
    record[INVALID_MODEL_INVOCATION_KEY] !== true &&
    isModelInvocationState(record[MODEL_INVOCATION_KEY])
  ) {
    return record[MODEL_INVOCATION_KEY];
  }
  return legacyState(config.legacy.get(name));
}

interface ResolveFromConfigsOptions {
  name: string;
  sourceDefault: boolean;
  scope: SettingsScope;
  projectTrusted: boolean;
  configs: InvocationConfigSet;
}

function resolveFromConfigs({
  name,
  sourceDefault,
  scope,
  projectTrusted,
  configs,
}: ResolveFromConfigsOptions): { disabled: boolean; source: ValueSource } {
  if (scope === "project" && projectTrusted && configs.project) {
    const projectState = stateFromConfig(configs.project, name);
    if (projectState) return { disabled: projectState === "disabled", source: "project" };
  }

  const globalState = stateFromConfig(configs.global, name);
  if (globalState) return { disabled: globalState === "disabled", source: "global" };

  return { disabled: sourceDefault, source: "default" };
}

/** Resolve a scoped Model Invocation preference without reading untrusted project config. */
export function resolveInvocation({
  name,
  sourceDefault,
  scope,
  cwd,
  projectTrusted,
  homeDir,
}: ResolveInvocationOptions): { disabled: boolean; source: ValueSource } {
  return resolveFromConfigs({
    name,
    sourceDefault,
    scope,
    projectTrusted,
    configs: readInvocationConfigs(cwd, projectTrusted && scope === "project", homeDir),
  });
}

function removeOwn(target: SkillConfigRecord, key: string): void {
  if (hasOwn(target, key)) delete target[key];
}

function setInvalidState(record: SkillConfigRecord, value: unknown): void {
  setOwn(record, MODEL_INVOCATION_KEY, value);
  setOwn(record, INVALID_MODEL_INVOCATION_KEY, true);
}

function removeLegacyKeys(section: SkillConfigRecord, keys: ReadonlySet<string>): void {
  for (const key of keys) removeOwn(section, key);
}

interface MigrateLegacyEntryOptions {
  config: ParsedInvocationConfig;
  name: string;
  value: unknown;
  nextSection: SkillConfigRecord;
  remainingLegacy: SkillConfigRecord;
}

function migrateLegacyEntry({
  config,
  name,
  value,
  nextSection,
  remainingLegacy,
}: MigrateLegacyEntryOptions): void {
  const record = config.records.get(name);
  const oldState = legacyState(value);
  if (config.invalidRecords.has(name)) {
    setOwn(remainingLegacy, name, value);
    return;
  }

  if (!record) {
    const migrated: SkillConfigRecord = {};
    if (oldState) setOwn(migrated, MODEL_INVOCATION_KEY, oldState);
    else setInvalidState(migrated, value);
    config.records.set(name, migrated);
    setOwn(nextSection, name, migrated);
    return;
  }

  if (!hasOwn(record, MODEL_INVOCATION_KEY)) {
    if (oldState) setOwn(record, MODEL_INVOCATION_KEY, oldState);
    else setInvalidState(record, value);
    setOwn(nextSection, name, record);
    return;
  }

  const currentValid =
    record[INVALID_MODEL_INVOCATION_KEY] !== true &&
    isModelInvocationState(record[MODEL_INVOCATION_KEY]);
  if (!currentValid || !oldState) setOwn(remainingLegacy, name, value);
}

function migrateLegacyEntries(
  config: ParsedInvocationConfig,
  nextSection: SkillConfigRecord,
): SkillConfigRecord {
  const remainingLegacy: SkillConfigRecord = {};
  removeLegacyKeys(nextSection, config.legacyMapKeys);
  for (const [name, value] of config.legacy) {
    migrateLegacyEntry({ config, name, value, nextSection, remainingLegacy });
  }
  return remainingLegacy;
}

interface ApplyInvocationChangeOptions {
  name: string;
  disabled: boolean | undefined;
  records: Map<string, SkillConfigRecord>;
  invalidRecords: Map<string, unknown>;
  nextSection: SkillConfigRecord;
  remainingLegacy: SkillConfigRecord;
}

function applyInvocationChange({
  name,
  disabled,
  records,
  invalidRecords,
  nextSection,
  remainingLegacy,
}: ApplyInvocationChangeOptions): void {
  if (disabled === undefined) {
    const record = records.get(name);
    if (record) {
      removeOwn(record, MODEL_INVOCATION_KEY);
      removeOwn(record, INVALID_MODEL_INVOCATION_KEY);
      if (Object.keys(record).length === 0) removeOwn(nextSection, name);
      else setOwn(nextSection, name, record);
    } else if (invalidRecords.has(name)) {
      removeOwn(nextSection, name);
    }
    removeOwn(remainingLegacy, name);
    return;
  }

  const record = records.get(name) ?? {};
  setOwn(record, MODEL_INVOCATION_KEY, disabled ? "disabled" : "enabled");
  removeOwn(record, INVALID_MODEL_INVOCATION_KEY);
  setOwn(nextSection, name, record);
  removeOwn(remainingLegacy, name);
}

/**
 * Set or remove one scoped Model Invocation preference.
 *
 * Writes use per-skill records. Legacy booleans are converted. Invalid legacy
 * values use a marker so their raw value stays invalid and visible to repair.
 */
export function persistInvocation({
  name,
  disabled,
  scope,
  cwd,
  homeDir,
}: InvocationOptions & { disabled: boolean | undefined }): void {
  const config = readInvocationConfig(scope, cwd, homeDir);
  const nextSection = cloneRecord(config.section);
  setOwn(nextSection, SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  const remainingLegacy = migrateLegacyEntries(config, nextSection);
  applyInvocationChange({
    name,
    disabled,
    records: config.records,
    invalidRecords: config.invalidRecords,
    nextSection,
    remainingLegacy,
  });

  if (Object.keys(remainingLegacy).length > 0) {
    setOwn(nextSection, LEGACY_MODEL_INVOCATION_KEY, remainingLegacy);
  }
  replaceSupiConfigSection({ section: CONFIG_SECTION, scope, cwd }, nextSection, { homeDir });
}

/** Return invalid skill names grouped by config scope for warning displays. */
export function readInvalidInvocationConfigNames(
  cwd: string,
  projectTrusted: boolean,
  homeDir?: string,
): Array<{ scope: SettingsScope; names: string[] }> {
  const configs = readInvocationConfigs(cwd, projectTrusted, homeDir);
  return (Object.entries(configs) as Array<[SettingsScope, ParsedInvocationConfig | undefined]>)
    .filter((entry): entry is [SettingsScope, ParsedInvocationConfig] =>
      Boolean(entry[1] && entry[1].invalidNames.size > 0),
    )
    .map(([scope, config]) => ({ scope, names: [...config.invalidNames] }));
}
