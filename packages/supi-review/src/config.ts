import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";
import { CURRENT_SESSION_REVIEW_MODEL } from "./model.ts";

/** Persisted model choices for agent-triggered reviews and optional planning. */
export interface ReviewConfig extends Record<string, unknown> {
  /** Canonical reviewer model id, or `current` for the active session model. */
  agentModel: string;
  /** Canonical Planner model id, or `current` for the active session model. */
  plannerModel: string;
}

/** Shared SuPi configuration section owned by this package. */
export const REVIEW_CONFIG_SECTION = "review";
/** Availability-safe defaults; users can configure a separate lightweight Planner model. */
export const REVIEW_DEFAULTS: ReviewConfig = {
  agentModel: CURRENT_SESSION_REVIEW_MODEL,
  plannerModel: CURRENT_SESSION_REVIEW_MODEL,
};

/** Load merged and normalized review configuration. */
export function loadReviewConfig(cwd: string, homeDir?: string): ReviewConfig {
  const raw = loadSupiConfig(REVIEW_CONFIG_SECTION, cwd, REVIEW_DEFAULTS, { homeDir });
  const readModel = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  return {
    agentModel: readModel(raw.agentModel, REVIEW_DEFAULTS.agentModel),
    plannerModel: readModel(raw.plannerModel, REVIEW_DEFAULTS.plannerModel),
  };
}

/** Contribute reviewer and Planner model pickers to `/supi-settings`. */
export function registerReviewSettings(pi: ExtensionAPI, homeDir?: string): void {
  const currentOption = {
    value: CURRENT_SESSION_REVIEW_MODEL,
    label: "current session model",
  };
  registerDeclarativeSettings(pi, {
    id: REVIEW_CONFIG_SECTION,
    label: "Review",
    section: REVIEW_CONFIG_SECTION,
    defaults: REVIEW_DEFAULTS,
    fields: [
      {
        kind: "modelPicker",
        key: "agentModel",
        label: "Reviewer model",
        description: "Model shared by all tasks in an agent-triggered review run.",
        includeDisabled: false,
        staticOptions: [currentOption],
      },
      {
        kind: "modelPicker",
        key: "plannerModel",
        label: "Planner model",
        description: "Lightweight model used only when planning is set to suggest.",
        includeDisabled: false,
        staticOptions: [currentOption],
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
