import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";
import { CURRENT_SESSION_REVIEW_MODEL } from "./model.ts";

/** Persisted configuration for agent-driven Session-Aware Review. */
export interface ReviewConfig extends Record<string, unknown> {
  /** Canonical `provider/model-id`, or `current` to use the active session model. */
  agentModel: string;
}

/** Shared SuPi config section owned by supi-review. */
export const REVIEW_CONFIG_SECTION = "review";

/** Package defaults for supi-review configuration. */
export const REVIEW_DEFAULTS: ReviewConfig = {
  agentModel: CURRENT_SESSION_REVIEW_MODEL,
};

/** Load merged, validated supi-review configuration for a workspace. */
export function loadReviewConfig(cwd: string, homeDir?: string): ReviewConfig {
  const raw = loadSupiConfig(REVIEW_CONFIG_SECTION, cwd, REVIEW_DEFAULTS, { homeDir });
  const agentModel =
    typeof raw.agentModel === "string" && raw.agentModel.trim()
      ? raw.agentModel.trim()
      : REVIEW_DEFAULTS.agentModel;
  return { agentModel };
}

/** Register the Review section contributed to `/supi-settings`. */
export function registerReviewSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerDeclarativeSettings(pi, {
    id: REVIEW_CONFIG_SECTION,
    label: "Review",
    section: REVIEW_CONFIG_SECTION,
    defaults: REVIEW_DEFAULTS,
    fields: [
      {
        kind: "modelPicker",
        key: "agentModel",
        label: "Agent tool model",
        description: "Model used for brief synthesis and reviewers started by supi_review_prepare.",
        includeDisabled: false,
        staticOptions: [
          {
            value: CURRENT_SESSION_REVIEW_MODEL,
            label: "current session model",
            description: "Use the model active when supi_review_prepare starts",
          },
        ],
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
