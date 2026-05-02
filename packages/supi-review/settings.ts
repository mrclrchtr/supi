import type { SettingItem } from "@mariozechner/pi-tui";
import { loadSupiConfig, registerConfigSettings } from "@mrclrchtr/supi-core";
import type { ReviewSettings } from "./types.ts";

export const REVIEW_DEFAULTS: ReviewSettings = {
  reviewFastModel: "",
  reviewDeepModel: "",
  maxDiffBytes: 100_000,
};

export function loadReviewSettings(cwd: string, homeDir?: string): ReviewSettings {
  return loadSupiConfig("review", cwd, REVIEW_DEFAULTS, { homeDir });
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
      if (settingId === "reviewFastModel") {
        if (value.trim()) {
          helpers.set("reviewFastModel", value.trim());
        } else {
          helpers.unset("reviewFastModel");
        }
      } else if (settingId === "reviewDeepModel") {
        if (value.trim()) {
          helpers.set("reviewDeepModel", value.trim());
        } else {
          helpers.unset("reviewDeepModel");
        }
      } else if (settingId === "maxDiffBytes") {
        const num = Number.parseInt(value, 10);
        if (Number.isFinite(num) && num > 0) {
          helpers.set("maxDiffBytes", num);
        } else {
          helpers.unset("maxDiffBytes");
        }
      }
    },
  });
}

function buildReviewSettingItems(settings: ReviewSettings): SettingItem[] {
  return [
    {
      id: "reviewFastModel",
      label: "Fast Review Model",
      description:
        "Model for fast reviews (e.g. openai/gpt-4o-mini). Empty = inherit session model.",
      currentValue: settings.reviewFastModel || "(inherit)",
      values: [], // free-form input
    },
    {
      id: "reviewDeepModel",
      label: "Deep Review Model",
      description:
        "Model for deep reviews (e.g. anthropic/claude-sonnet-4-5). Empty = inherit session model.",
      currentValue: settings.reviewDeepModel || "(inherit)",
      values: [],
    },
    {
      id: "maxDiffBytes",
      label: "Max Diff Size",
      description: "Maximum diff bytes before truncation (default 100000)",
      currentValue: String(settings.maxDiffBytes),
      values: [],
    },
  ];
}
