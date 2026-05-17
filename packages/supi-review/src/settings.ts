import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, type SettingItem } from "@earendil-works/pi-tui";
import {
  type ConfigSettingsHelpers,
  loadSupiConfig,
  registerConfigSettings,
} from "@mrclrchtr/supi-core/api";
import type { ReviewSettings } from "./types.ts";

export const REVIEW_DEFAULTS: ReviewSettings = {
  reviewModel: "",
  maxDiffBytes: 100_000,
  autoFix: false,
};

const INHERIT_MODEL_VALUE = "(inherit)";

let reviewModelChoices: string[] = [];

export function loadReviewSettings(cwd: string, homeDir?: string): ReviewSettings {
  return loadSupiConfig("review", cwd, REVIEW_DEFAULTS, { homeDir });
}

/**
 * Update the model ids offered by `/supi-settings` for review depth overrides.
 *
 * The list is session-local and mirrors the currently available authenticated models.
 */
export function setReviewModelChoices(modelChoices: string[]): void {
  reviewModelChoices = Array.from(
    new Set(modelChoices.map((choice) => choice.trim()).filter((choice) => choice.length > 0)),
  );
}

export function registerReviewSettings(): void {
  registerConfigSettings({
    id: "review",
    label: "Review",
    section: "review",
    defaults: REVIEW_DEFAULTS,
    buildItems: (settings) => buildReviewSettingItems(settings),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      switch (settingId) {
        case "reviewModel":
          persistModelOverride(value, helpers);
          break;
        case "maxDiffBytes":
          persistMaxDiffBytes(value, helpers);
          break;
        case "autoFix":
          persistAutoFix(value, helpers);
          break;
      }
    },
  });
}

function persistModelOverride(value: string, helpers: ConfigSettingsHelpers): void {
  if (value.trim() && value !== INHERIT_MODEL_VALUE) {
    helpers.set("reviewModel", value.trim());
  } else {
    helpers.unset("reviewModel");
  }
}

function persistMaxDiffBytes(value: string, helpers: ConfigSettingsHelpers): void {
  const num = Number.parseInt(value, 10);
  if (Number.isFinite(num) && num > 0) {
    helpers.set("maxDiffBytes", num);
  } else {
    helpers.unset("maxDiffBytes");
  }
}

function persistAutoFix(value: string, helpers: ConfigSettingsHelpers): void {
  if (value === "on") {
    helpers.set("autoFix", true);
  } else {
    helpers.unset("autoFix");
  }
}

// ─── Scoped model helpers (workaround for pi-mono#3535) ──────────────────────

/**
 * Read PI’s `enabledModels` from settings.json (the user’s configured scoped model patterns).
 * Returns undefined when no scope is configured (all models available).
 */
export function readPiEnabledModels(): string[] | undefined {
  try {
    const settingsPath = join(getAgentDir(), "settings.json");
    if (!existsSync(settingsPath)) return undefined;
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.enabledModels)) {
      const patterns = parsed.enabledModels.filter(
        (p: unknown): p is string => typeof p === "string" && p.length > 0,
      );
      return patterns.length > 0 ? patterns : undefined;
    }
  } catch {
    // settings.json may not exist or be invalid JSON
  }
  return undefined;
}

/**
 * Filter available models to only those matching enabled model patterns.
 * Uses simple glob-style matching (* and ? wildcards) on both bare model IDs
 * and canonical provider/modelId references.
 */
export function filterByEnabledModels<T extends { provider: string; id: string }>(
  patterns: string[],
  available: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const model of available) {
    for (const pattern of patterns) {
      if (matchModelPattern(model, pattern)) {
        const key = `${model.provider}/${model.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(model);
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Match a model against a single pattern.
 * - If pattern contains "/", match against canonical “provider/modelId”
 * - Otherwise, match against both bare modelId and canonical ref
 * - Supports * (any chars) and ? (single char) wildcards
 */
function matchModelPattern(model: { provider: string; id: string }, pattern: string): boolean {
  const canonical = `${model.provider}/${model.id}`;

  // Pattern with a slash is always canonical
  if (pattern.includes("/")) {
    return simpleGlobMatch(canonical, pattern);
  }

  // Bare pattern: try both canonical and bare model id
  return simpleGlobMatch(canonical, pattern) || simpleGlobMatch(model.id, pattern);
}

/**
 * Simple glob matching with * (any chars) and ? (single char) wildcards.
 * Falls back to exact case-insensitive comparison when no wildcards are present.
 */
function simpleGlobMatch(text: string, pattern: string): boolean {
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return text.toLowerCase() === pattern.toLowerCase();
  }

  // Convert simple glob to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regexStr}$`, "i").test(text);
}

function buildReviewSettingItems(settings: ReviewSettings): SettingItem[] {
  return [
    {
      id: "reviewModel",
      label: "Review Model",
      description:
        "Preselect the model used by /supi-review. Inherit uses the active session model.",
      currentValue: settings.reviewModel || INHERIT_MODEL_VALUE,
      values: buildModelCycleValues(settings.reviewModel),
    },
    {
      id: "maxDiffBytes",
      label: "Max Diff Size",
      description: "Maximum diff bytes before truncation (default 100000)",
      currentValue: String(settings.maxDiffBytes),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "Max diff bytes before truncation:", done),
    },
    {
      id: "autoFix",
      label: "Auto-Fix After Review",
      description: "Automatically trigger a fix turn after review completes with findings",
      currentValue: settings.autoFix ? "on" : "off",
      values: ["on", "off"],
    },
  ];
}

function buildModelCycleValues(currentValue: string): string[] {
  const values = [INHERIT_MODEL_VALUE];
  if (currentValue && !reviewModelChoices.includes(currentValue)) {
    values.push(currentValue);
  }
  values.push(...reviewModelChoices);
  return values;
}

function createInputSubmenu(
  currentValue: string,
  label: string,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const input = new Input();
  input.setValue(currentValue);

  return {
    render: (width: number) => {
      const lines = [`  ${label}`];
      lines.push(...input.render(width));
      lines.push("  enter confirm • esc cancel");
      return lines;
    },
    invalidate: () => {
      input.invalidate();
    },
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        done();
        return true;
      }
      if (matchesKey(data, Key.enter)) {
        done(input.getValue());
        return true;
      }
      input.handleInput(data);
      return true;
    },
  };
}
