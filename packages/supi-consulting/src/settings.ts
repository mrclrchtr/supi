import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import {
  CONSULTING_CONFIG_SECTION,
  CONSULTING_DEFAULTS,
  validateAdditionalReadOnlyDirectories,
} from "./config.ts";
import type { ConsultingRuntime } from "./runtime.ts";

/** Register the Consulting setting with an awaited availability refresh. */
export function registerConsultingSettings(
  pi: ExtensionAPI,
  runtime: ConsultingRuntime,
  homeDir?: string,
): void {
  const fixedSettings = defineConfigSettings({
    id: CONSULTING_CONFIG_SECTION,
    label: "Consulting",
    section: CONSULTING_CONFIG_SECTION,
    defaults: CONSULTING_DEFAULTS,
    fields: [
      {
        kind: "boolean" as const,
        key: "agentToolEnabled",
        label: "Consultation tool",
        description: "Enable consulting_run and its availability checks.",
      },
      {
        kind: "stringList" as const,
        key: "additionalReadOnlyDirectories",
        label: "Additional read-only directories",
        description:
          "Comma-separated absolute directories for every Consultation, including without Workspace Access. No shell expansion or globs; broad paths can expose sensitive files.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });

  registerSettings(pi, {
    ...fixedSettings,
    apply: async (request) => {
      if (request.fieldKey === "additionalReadOnlyDirectories" && request.action.kind === "set") {
        validateAdditionalReadOnlyDirectories(
          request.action.value
            .split(",")
            .map((path) => path.trim())
            .filter(Boolean),
        );
      }
      const result = await fixedSettings.apply(request);
      if (request.fieldKey === "agentToolEnabled") {
        await runtime.refresh(request.cwd, request.ctx);
      }
      return result;
    },
  });
}
