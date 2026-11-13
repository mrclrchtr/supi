import {
  createCodemodeExtension,
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import headlessInspectionProfile from "@mrclrchtr/supi-code-intelligence/headless";
import { type ChildWebToolProvision, registerShellHints } from "@mrclrchtr/supi-core/session";

/** Loader and settings manager preconfigured for an isolated child session. */
export interface IsolatedChildResources {
  loader: DefaultResourceLoader;
  settingsManager: SettingsManager;
}

/** Optional Reviewer Extension Set settings for one isolated child. */
export interface IsolatedChildResourceOptions {
  headlessInspection?: boolean;
  /** Load PI codemode only for an explicitly opted-in Reviewer. */
  codemode?: boolean;
  /** Session-provided Web tools for Reviewer Web Access; omitted means none. */
  webTools?: ChildWebToolProvision;
  projectTrusted?: boolean;
}

/**
 * Build child-session resources with the package-owned protocol as the complete
 * system prompt and no ambient settings or discovered prompt content. Compaction
 * and retries stay disabled so provider limits apply to the original packet directly.
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
  const extensionFactories = [
    { name: "supi-shell-hints", factory: registerShellHints },
    ...(options.headlessInspection
      ? [{ name: "supi-code-intelligence-headless", factory: headlessInspectionProfile }]
      : []),
    ...(options.codemode ? [createCodemodeExtension({ models: true, mode: "on" })] : []),
    ...(options.webTools && options.webTools.toolNames.length > 0
      ? [
          {
            name: "supi-web-child",
            factory: options.webTools.createFactory(options.webTools.toolNames),
          },
        ]
      : []),
  ];
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    ...(extensionFactories.length > 0 ? { extensionFactories } : {}),
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => protocolPrompt,
    appendSystemPromptOverride: () => [],
  });
  return { loader, settingsManager };
}
