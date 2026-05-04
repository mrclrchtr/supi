import { Input, Key, matchesKey, type SettingItem } from "@mariozechner/pi-tui";
import {
  type ConfigSettingsHelpers,
  loadSupiConfig,
  registerConfigSettings,
} from "@mrclrchtr/supi-core";
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
