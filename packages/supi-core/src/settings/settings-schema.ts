// Fixed SuPi-config adapter for the canonical settings module interface.
//
// Declarative field descriptors let the adapter own scope inheritance,
// source-state resolution, value rendering, persistence, and Unset actions.
//
// Custom fields remain for nested or unusual config; they report the same
// source state as declarative flat fields.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  loadSupiConfigSectionForScope,
  removeSupiConfigKey,
  writeSupiConfig,
} from "../config/config.ts";
import type { SettingsApplyResult, SettingsModule, SettingsScope } from "./settings-registry.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/** Where the current effective value comes from. */
export type ValueSource = "project" | "global" | "default";

/** Structured notification fired to afterPersist. */
export interface SettingsPersistedChange {
  scope: SettingsScope;
  cwd: string;
  /** The config key that was mutated. */
  fieldKey: string;
  /** What happened: set an explicit value or deleted the scoped key. */
  action: "set" | "delete";
  /** The value written (only present for "set"). */
  storedValue?: unknown;
  /** The effective value after the save (merging defaults ← global ← project). */
  effectiveValue: unknown;
  /** Where the effective value now comes from. */
  effectiveSource: ValueSource;
}

/** Helpers passed to custom-field persist handlers. */
export interface ConfigHelpers {
  set(key: string, value: unknown): void;
  unset(key: string): void;
}

// ── Field actions ─────────────────────────────────────────────────────────

/** A user-initiated action on a settings row. */
export type SettingsAction = { kind: "set"; value: string } | { kind: "unset" };

// ── Field descriptors ─────────────────────────────────────────────────────

interface BaseField {
  /** Config key in the section (e.g. "enabled", "severity"). */
  key: string;
  /** Display label. */
  label: string;
  /** Optional description shown when the row is selected. */
  description?: string;
}

/** Boolean on/off toggle. */
export interface BoolField extends BaseField {
  kind: "boolean";
}

/** Enumeration of string choices (cycle via Space). */
export interface EnumField extends BaseField {
  kind: "enum";
  values: string[];
}

/** Integer field; with discrete values for cycling or absent for free input. */
export interface NumberField extends BaseField {
  kind: "number";
  /** Discrete choices for Space cycling; absent = free text input. */
  values?: string[];
}

/** One free-form string. */
export interface StringField extends BaseField {
  kind: "string";
}

/** Comma-separated string list. */
export interface StringListField extends BaseField {
  kind: "stringList";
}

/** One non-model choice shown before the scoped models in a model picker. */
export interface ModelPickerStaticOption {
  /** Persisted value for the choice. */
  value: string;
  /** Human-readable picker label. */
  label: string;
  /** Optional explanation shown alongside the label. */
  description?: string;
}

/** Model picker backed by the scoped model set. */
export interface ModelPickerField extends BaseField {
  kind: "modelPicker";
  /** Additional host-owned choices shown before scoped models. */
  staticOptions?: ModelPickerStaticOption[];
  /** Whether to include the built-in `disabled` choice. Defaults to true. */
  includeDisabled?: boolean;
}

/**
 * Custom / escape-hatch field for nested config or unusual controls.
 *
 * The field must report its display value and source so the settings UI
 * can render consistent source badges and action menus.
 */
export interface CustomField extends BaseField {
  kind: "custom";
  /**
   * Return the display value and its source for the given scope.
   * Called on every scope toggle and after persistence.
   */
  resolve: (
    scope: SettingsScope,
    cwd: string,
    ctx?: ExtensionContext,
  ) => {
    /** Human-readable value text, without the source badge. */
    displayValue: string;
    /** Value used to prefill editors/pickers; defaults to displayValue when omitted. */
    editValue?: string;
    source: ValueSource;
    /** When scope is "project" and source is "project", the source after deletion. */
    inheritanceSource?: "global" | "default";
  };
  /**
   * Submenu component factory for editing (Enter).
   * Receives the resolved display value and a done callback; return a pi-tui
   * Component-like object. Undefined means Enter opens the action menu only.
   */
  submenu?: (
    currentValue: string,
    done: (selectedValue?: string) => void,
    scope: SettingsScope,
    cwd: string,
    ctx?: ExtensionContext,
  ) => Component;
  /**
   * Persist handler called on set or unset actions.
   * Required for custom fields so they can write their nested config.
   */
  persist: (
    scope: SettingsScope,
    cwd: string,
    action: SettingsAction,
    helpers: ConfigHelpers,
  ) => void | Promise<void>;
}

/** Union of all supported field kinds. */
export type SettingsField =
  | BoolField
  | EnumField
  | NumberField
  | StringField
  | StringListField
  | ModelPickerField
  | CustomField;

// ── Contribution options ──────────────────────────────────────────────────

/** Options for the fixed SuPi-config settings adapter. */
export interface ConfigSettingsOptions {
  /** Stable contribution identifier — e.g. "lsp", "claude-md". */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** SuPi config section name — e.g. "lsp", "claude-md". */
  section: string;
  /** Package-default config values (indexable by field key). */
  defaults: Record<string, unknown>;
  /** Declarative field descriptors. */
  fields: SettingsField[];
  /** Optional live runtime sync after successful persistence. */
  afterPersist?: (change: SettingsPersistedChange) => void;
  /** Optional home directory for config resolution (testing). */
  homeDir?: string;
}

// ── Source-aware row interface ───────────────────────────────────────────

/** Resolved value for one field in one scope. */
export interface ScopedFieldValue {
  /** The field descriptor. */
  field: SettingsField;
  /** Display value string shown in the row (with source badge). */
  displayValue: string;
  /** Value used to prefill editors/pickers, without the source badge. */
  editValue: string;
  /** Where the value comes from. */
  source: ValueSource;
  /**
   * When scope is "project" and source is "project", the source that would
   * apply after deleting the project override ("global" or "default").
   * Undefined otherwise.
   */
  inheritanceSource?: "global" | "default";
}

// ── Source resolution ─────────────────────────────────────────────────────

/**
 * Resolve the effective value and source for a flat key.
 *
 * For project scope: checks project → global → defaults.
 * For global scope: checks global → defaults.
 */
// biome-ignore lint/complexity/useMaxParams: resolveValue needs all scope/source parameters for honest multi-tier resolution
export function resolveValue<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  projectRaw: Record<string, unknown> | null,
  globalRaw: Record<string, unknown> | null,
  scope: SettingsScope,
): { value: unknown; source: ValueSource } {
  // Check direct scope first
  const directRaw = scope === "project" ? projectRaw : globalRaw;
  if (directRaw && key in directRaw) {
    return { value: directRaw[key], source: scope };
  }

  // For project scope, check global
  if (scope === "project" && globalRaw && key in globalRaw) {
    return { value: globalRaw[key], source: "global" };
  }

  // Fall back to defaults
  return { value: defaults[key], source: "default" };
}

// ── Value formatting ──────────────────────────────────────────────────────

/** Format a value for display. */
export function formatValue(value: unknown, field: SettingsField): string {
  switch (field.kind) {
    case "boolean":
      return value ? "on" : "off";
    case "number":
      return String(value ?? "");
    case "string":
      return typeof value === "string" && value ? value : "none";
    case "stringList": {
      const arr = Array.isArray(value) ? value : [];
      return arr.length > 0 ? arr.map(String).join(", ") : "none";
    }
    default:
      return String(value ?? "");
  }
}

/** Build source-badged display text. */
export function sourceBadge(displayValue: string, source: ValueSource): string {
  switch (source) {
    case "project":
      return `${displayValue} (project)`;
    case "global":
      return `${displayValue} (global)`;
    case "default":
      return `${displayValue} (default)`;
  }
}

/** Format the value used to prefill editors and compare concrete choices. */
export function formatEditValue(value: unknown, field: SettingsField): string {
  if (field.kind === "string") return typeof value === "string" ? value : "";
  if (field.kind === "stringList") {
    const arr = Array.isArray(value) ? value : [];
    return arr.map(String).join(", ");
  }
  return formatValue(value, field);
}

// ── Persistence helpers ───────────────────────────────────────────────────

function createConfigHelpers(
  section: string,
  scope: SettingsScope,
  cwd: string,
  homeDir?: string,
): ConfigHelpers {
  return {
    set: (key: string, val: unknown) => {
      writeSupiConfig({ section, scope, cwd }, { [key]: val }, { homeDir });
    },
    unset: (key: string) => {
      removeSupiConfigKey({ section, scope, cwd }, key, { homeDir });
    },
  };
}

// ── Fixed config adapter ─────────────────────────────────────────────────

interface NotifyAfterPersistInput {
  options: ConfigSettingsOptions;
  field: SettingsField;
  scope: SettingsScope;
  cwd: string;
  action: SettingsAction;
  storedValue: unknown;
  ctx?: ExtensionContext;
}

function notifyAfterPersist(input: NotifyAfterPersistInput): void {
  const { options, field, scope, cwd, action, storedValue, ctx } = input;
  if (!options.afterPersist) return;

  let effectiveValue: unknown;
  let effectiveSource: ValueSource;

  if (field.kind === "custom") {
    const resolved = field.resolve(scope, cwd, ctx);
    effectiveValue = resolved.editValue ?? resolved.displayValue;
    effectiveSource = resolved.source;
  } else {
    const projectRaw = loadSupiConfigSectionForScope(options.section, cwd, {
      scope: "project",
      homeDir: options.homeDir,
    });
    const globalRaw = loadSupiConfigSectionForScope(options.section, cwd, {
      scope: "global",
      homeDir: options.homeDir,
    });
    const resolved = resolveValue(field.key, options.defaults, projectRaw, globalRaw, scope);
    effectiveValue = resolved.value;
    effectiveSource = resolved.source;
  }

  const change: SettingsPersistedChange = {
    scope,
    cwd,
    fieldKey: field.key,
    action: action.kind === "set" ? "set" : "delete",
    effectiveValue,
    effectiveSource,
  };
  if (action.kind === "set") change.storedValue = storedValue;
  options.afterPersist(change);
}

function resolveConfigRows(
  options: ConfigSettingsOptions,
  scope: SettingsScope,
  cwd: string,
  ctx?: ExtensionContext,
): ScopedFieldValue[] {
  const defaults = options.defaults as Record<string, unknown>;
  const projectRaw = loadSupiConfigSectionForScope(options.section, cwd, {
    scope: "project",
    homeDir: options.homeDir,
  });
  const globalRaw = loadSupiConfigSectionForScope(options.section, cwd, {
    scope: "global",
    homeDir: options.homeDir,
  });

  return options.fields.map((field) => {
    if (field.kind === "custom") {
      const resolved = field.resolve(scope, cwd, ctx);
      return {
        field,
        displayValue: resolved.displayValue
          ? sourceBadge(resolved.displayValue, resolved.source)
          : "",
        editValue: resolved.editValue ?? resolved.displayValue,
        source: resolved.source,
        inheritanceSource: resolved.inheritanceSource,
      };
    }

    const { value, source } = resolveValue(field.key, defaults, projectRaw, globalRaw, scope);
    const displayValue = formatValue(value, field);
    const inheritanceSource =
      scope === "project" && source === "project"
        ? globalRaw && field.key in globalRaw
          ? "global"
          : "default"
        : undefined;

    return {
      field,
      displayValue: sourceBadge(displayValue, source),
      editValue: formatEditValue(value, field),
      source,
      inheritanceSource,
    };
  });
}

async function applyConfigAction(
  options: ConfigSettingsOptions,
  request: Parameters<SettingsModule["apply"]>[0],
): Promise<SettingsApplyResult> {
  const { scope, cwd, fieldKey, action, ctx } = request;
  const field = options.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) return {};

  const helpers = createConfigHelpers(options.section, scope, cwd, options.homeDir);
  let storedValue: unknown;
  if (field.kind === "custom") {
    await field.persist(scope, cwd, action, helpers);
    storedValue = action.kind === "set" ? action.value : undefined;
  } else if (action.kind === "set") {
    storedValue = parseTypedValue(action.value, field);
    helpers.set(field.key, storedValue);
  } else {
    helpers.unset(field.key);
  }
  notifyAfterPersist({ options, field, scope, cwd, action, storedValue, ctx });
  return {};
}

/** Adapt one fixed SuPi config section to the canonical settings interface. */
export function defineConfigSettings(options: ConfigSettingsOptions): SettingsModule {
  return {
    id: options.id,
    label: options.label,
    read: ({ scope, cwd, ctx }) =>
      Promise.resolve({ rows: resolveConfigRows(options, scope, cwd, ctx) }),
    apply: (request) => applyConfigAction(options, request),
  };
}

// ── Typed value parsing ───────────────────────────────────────────────────

/** Parse a user-supplied string value into the typed config value for the field. */
export function parseTypedValue(value: string, field: SettingsField): unknown {
  switch (field.kind) {
    case "boolean":
      return value === "on";
    case "number": {
      if (!/^[1-9]\d*$/.test(value.trim())) {
        throw new Error(
          `Invalid value for "${field.label}": "${value}". Enter a positive integer.`,
        );
      }
      return Number.parseInt(value, 10);
    }
    case "stringList":
      return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    default:
      return value;
  }
}
