import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

/** Loader and settings manager preconfigured for an isolated child session. */
export interface IsolatedChildResources {
  loader: DefaultResourceLoader;
  settingsManager: SettingsManager;
}

/**
 * Build child-session resources with no ambient settings or discovered prompt
 * content. Compaction and retries stay disabled so provider limits apply to the
 * original packet directly.
 */
export function createIsolatedChildResources(
  cwd: string,
  protocolPrompt: string,
  agentDir = process.env.PI_CODING_AGENT_DIR || "",
): IsolatedChildResources {
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    appendSystemPrompt: [protocolPrompt],
    systemPromptOverride: () => undefined,
    appendSystemPromptOverride: () => [protocolPrompt],
  });
  return { loader, settingsManager };
}
