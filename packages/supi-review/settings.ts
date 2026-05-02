import { Input, Key, matchesKey, type SettingItem } from "@mariozechner/pi-tui";
import {
  type ConfigSettingsHelpers,
  loadSupiConfig,
  registerConfigSettings,
} from "@mrclrchtr/supi-core";
import type { ReviewSettings } from "./types.ts";

export const REVIEW_DEFAULTS: ReviewSettings = {
  reviewFastModel: "",
  reviewDeepModel: "",
  maxDiffBytes: 100_000,
  reviewTimeoutMinutes: 15,
};

const INHERIT_MODEL_VALUE = "(inherit)";

let reviewModelChoices: string[] = [];

export function loadReviewSettings(cwd: string, homeDir?: string): ReviewSettings {
  return loadSupiConfig("review", cwd, REVIEW_DEFAULTS, { homeDir });
}

/**
 * Update the model ids offered by `/supi-settings` for review depth overrides.
 *
 * The list is session-local and typically mirrors pi's current `--models` scope
 * when present, otherwise the currently available authenticated models.
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
        case "reviewFastModel":
          persistModelOverride("reviewFastModel", value, helpers);
          break;
        case "reviewDeepModel":
          persistModelOverride("reviewDeepModel", value, helpers);
          break;
        case "maxDiffBytes":
          persistMaxDiffBytes(value, helpers);
          break;
        case "reviewTimeoutMinutes":
          persistReviewTimeoutMinutes(value, helpers);
          break;
      }
    },
  });
}

function persistModelOverride(
  key: "reviewFastModel" | "reviewDeepModel",
  value: string,
  helpers: ConfigSettingsHelpers,
): void {
  if (value.trim() && value !== INHERIT_MODEL_VALUE) {
    helpers.set(key, value.trim());
  } else {
    helpers.unset(key);
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

function persistReviewTimeoutMinutes(value: string, helpers: ConfigSettingsHelpers): void {
  const num = Number.parseInt(value, 10);
  if (Number.isFinite(num) && num > 0) {
    helpers.set("reviewTimeoutMinutes", num);
  } else {
    helpers.unset("reviewTimeoutMinutes");
  }
}

function buildReviewSettingItems(settings: ReviewSettings): SettingItem[] {
  return [
    {
      id: "reviewFastModel",
      label: "Fast Review Model",
      description:
        "Cycle through the current pi model scope (or available models). Inherit uses the active session model.",
      currentValue: settings.reviewFastModel || INHERIT_MODEL_VALUE,
      values: buildModelCycleValues(settings.reviewFastModel),
    },
    {
      id: "reviewDeepModel",
      label: "Deep Review Model",
      description:
        "Cycle through the current pi model scope (or available models). Inherit uses the active session model.",
      currentValue: settings.reviewDeepModel || INHERIT_MODEL_VALUE,
      values: buildModelCycleValues(settings.reviewDeepModel),
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
      id: "reviewTimeoutMinutes",
      label: "Review Timeout",
      description: "Maximum review runtime in minutes (default 15)",
      currentValue: String(settings.reviewTimeoutMinutes),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "Review timeout in minutes:", done),
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
