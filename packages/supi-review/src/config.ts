import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { CURRENT_SESSION_REVIEW_MODEL } from "./model.ts";

/** Supported containing-Agent behaviors after a review returns findings. */
export const POST_REVIEW_POLICIES = ["ask", "verify", "verify-and-fix", "fix", "report"] as const;
/** Configured default behavior after a review returns findings. */
export type PostReviewPolicy = (typeof POST_REVIEW_POLICIES)[number];

/** Persisted review settings. */
export interface ReviewConfig extends Record<string, unknown> {
  /** Enable tools that start reviews and retrieve audits. */
  agentToolEnabled: boolean;
  /** Canonical reviewer model id, or `current` for the active session model. */
  agentModel: string;
  /** Canonical Planner model id, or `current` for the active session model. */
  plannerModel: string;
  /** Record every reviewer's local replay and enable replay retrieval. */
  auditEnabled: boolean;
  /** Shell command run once before reviewers start. */
  bootstrapCommand: string;
  /** Default containing-Agent behavior after a review returns findings. */
  postReviewPolicy: PostReviewPolicy;
}

/** Shared SuPi configuration section owned by this package. */
export const REVIEW_CONFIG_SECTION = "review";
/** Availability-safe defaults; users can configure a separate lightweight Planner model. */
export const REVIEW_DEFAULTS: ReviewConfig = {
  agentToolEnabled: true,
  agentModel: CURRENT_SESSION_REVIEW_MODEL,
  plannerModel: CURRENT_SESSION_REVIEW_MODEL,
  auditEnabled: false,
  bootstrapCommand: "",
  postReviewPolicy: "ask",
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
  const readPostReviewPolicy = (value: unknown) =>
    POST_REVIEW_POLICIES.find((policy) => policy === value) ?? REVIEW_DEFAULTS.postReviewPolicy;
  return {
    agentToolEnabled: readBoolean(raw.agentToolEnabled, REVIEW_DEFAULTS.agentToolEnabled),
    agentModel: readModel(raw.agentModel, REVIEW_DEFAULTS.agentModel),
    plannerModel: readModel(raw.plannerModel, REVIEW_DEFAULTS.plannerModel),
    auditEnabled: readBoolean(raw.auditEnabled, REVIEW_DEFAULTS.auditEnabled),
    bootstrapCommand: readCommand(raw.bootstrapCommand),
    postReviewPolicy: readPostReviewPolicy(raw.postReviewPolicy),
  };
}

/** Contribute reviewer and Planner model pickers to `/supi-settings`. */
export function registerReviewSettings(pi: ExtensionAPI, homeDir?: string): void {
  const currentOption = {
    value: CURRENT_SESSION_REVIEW_MODEL,
    label: "current session model",
  };
  registerSettings(
    pi,
    defineConfigSettings({
      id: REVIEW_CONFIG_SECTION,
      label: "Review",
      section: REVIEW_CONFIG_SECTION,
      defaults: REVIEW_DEFAULTS,
      fields: [
        {
          kind: "boolean",
          key: "agentToolEnabled",
          label: "Agent tools",
          description: "Enable review start and audit tools for agents. Requires /reload.",
        },
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
          description: "Powers the optional Planner Draft in /supi-review.",
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
          kind: "enum",
          key: "postReviewPolicy",
          label: "After review",
          description: "Default Agent behavior when a completed review returns findings.",
          values: [...POST_REVIEW_POLICIES],
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
    }),
  );
}
