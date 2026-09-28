import type { AgentsProfilePages, AgentsProfilePagesData } from "@mrclrchtr/supi-agent-runtime/api";
import { resolveProfileDefinition } from "./profile-catalogue.ts";
import { agentProfileCatalogueStore } from "./session.ts";
import type { ProfileCatalogue } from "./types.ts";

const MAX_PROFILE_DIAGNOSTICS = 20;

/** Supply Agent-owned Profile pages to the shared runtime viewer. */
export const agentProfilePages: AgentsProfilePages = {
  getData(): AgentsProfilePagesData | undefined {
    const catalogue = agentProfileCatalogueStore.get();
    if (!catalogue) return undefined;
    return {
      profiles: catalogue.profiles
        .filter(
          (profile) =>
            catalogue.profileIds.includes(profile.id) ||
            "code" in resolveProfileDefinition(profile),
        )
        .map((profile) => profilePage(profile, catalogue)),
      diagnostics: boundedDiagnostics(catalogue),
      omittedProfileCount: catalogue.omittedProfileCount,
      omittedDiagnosticCount: Math.max(0, catalogue.diagnostics.length - MAX_PROFILE_DIAGNOSTICS),
    };
  },
};

function profilePage(
  entry: ProfileCatalogue["profiles"][number],
  catalogue: ProfileCatalogue,
): AgentsProfilePagesData["profiles"][number] {
  const profile = resolveProfileDefinition(entry, catalogue.sourceDirectories);
  if ("code" in profile) {
    return {
      id: entry.id,
      description: entry.description,
      unavailable: profile.message,
    };
  }
  return {
    id: profile.id,
    description: profile.manifest.description,
    source: profile.source,
    directory: profile.directory,
    model: profile.manifest.model ?? "inherit",
    thinking: profile.manifest.thinking ?? "inherit",
    ...(profile.manifest.timeoutMinutes === undefined
      ? {}
      : { timeoutMinutes: profile.manifest.timeoutMinutes }),
    tools: profile.manifest.tools,
    systemPrompt: profile.manifest.systemPrompt,
    instructionScopes: profile.manifest.instructionScopes,
    ...(profile.fieldSources
      ? {
          fieldSources: Object.fromEntries(
            Object.entries(profile.fieldSources).map(([key, value]) => [key, String(value)]),
          ),
        }
      : {}),
  };
}

function boundedDiagnostics(catalogue: ProfileCatalogue): AgentsProfilePagesData["diagnostics"] {
  return [...catalogue.diagnostics]
    .sort((left, right) => {
      if (left.code === right.code) return 0;
      if (left.code === "catalogue-overflow") return -1;
      if (right.code === "catalogue-overflow") return 1;
      return 0;
    })
    .slice(0, MAX_PROFILE_DIAGNOSTICS);
}
