import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import headlessInspectionProfile from "@mrclrchtr/supi-code-intelligence/headless";

/** Loader and settings manager preconfigured for an isolated child session. */
export interface IsolatedChildResources {
  loader: DefaultResourceLoader;
  settingsManager: SettingsManager;
}

/** Optional Reviewer Extension Set settings for one isolated child. */
export interface IsolatedChildResourceOptions {
  headlessInspection?: boolean;
  projectTrusted?: boolean;
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
  options: IsolatedChildResourceOptions = {},
): IsolatedChildResources {
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  settingsManager.setProjectTrusted(options.projectTrusted ?? false);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    ...(options.headlessInspection
      ? {
          extensionFactories: [
            { name: "supi-code-intelligence-headless", factory: headlessInspectionProfile },
          ],
        }
      : {}),
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
