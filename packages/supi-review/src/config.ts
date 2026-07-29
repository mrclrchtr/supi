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
  /** Record every reviewer's local replay and enable replay retrieval. */
  auditEnabled: boolean;
  /** Shell command run once before reviewers start. */
  bootstrapCommand: string;
}

/** Shared SuPi configuration section owned by this package. */
export const REVIEW_CONFIG_SECTION = "review";
/** Availability-safe defaults; users can configure a separate lightweight Planner model. */
export const REVIEW_DEFAULTS: ReviewConfig = {
  agentModel: CURRENT_SESSION_REVIEW_MODEL,
  plannerModel: CURRENT_SESSION_REVIEW_MODEL,
  auditEnabled: false,
  bootstrapCommand: "",
};

/** Load merged and normalized review configuration. */
export function loadReviewConfig(cwd: string, homeDir?: string): ReviewConfig {
  const raw = loadSupiConfig(REVIEW_CONFIG_SECTION, cwd, REVIEW_DEFAULTS, { homeDir });
  const readModel = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const readBoolean = (value: unknown, fallback: boolean) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.trim().toLowerCase() === "true";
    return fallback;
  };
  const readCommand = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    agentModel: readModel(raw.agentModel, REVIEW_DEFAULTS.agentModel),
    plannerModel: readModel(raw.plannerModel, REVIEW_DEFAULTS.plannerModel),
    auditEnabled: readBoolean(raw.auditEnabled, REVIEW_DEFAULTS.auditEnabled),
    bootstrapCommand: readCommand(raw.bootstrapCommand),
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
      {
        kind: "string",
        key: "bootstrapCommand",
        label: "Bootstrap command",
        description:
          "Run once in the frozen Review Workspace before reviewers start. Empty lets reviewers bootstrap when needed.",
      },
      {
        kind: "boolean" as const,
        key: "auditEnabled",
        label: "Local reviewer replay",
        description:
          "Record every reviewer's raw messages and tool output locally for seven days. Requires /reload.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
