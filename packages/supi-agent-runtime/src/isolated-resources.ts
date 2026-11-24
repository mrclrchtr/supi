import {
  createCodemodeExtension,
  DefaultResourceLoader,
  getAgentDir,
  type InlineExtension,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  type ChildWebToolName,
  type ChildWebToolProvision,
  registerShellHints,
} from "@mrclrchtr/supi-core/session";
import { registerToolRules } from "./tool-rules.ts";

/** One instruction file passed into an isolated Agent Run, as Pi's context files. */
export interface AgentRunInstructionFile {
  readonly path: string;
  readonly content: string;
}

/** Caller policy for {@link createIsolatedAgentResources}. */
export interface IsolatedAgentResourceOptions {
  readonly cwd: string;
  /** Pi agent directory; defaults to {@link resolveAgentRunAgentDir}. */
  readonly agentDir?: string;
  /** Project-trust decision of the containing session. */
  readonly projectTrusted: boolean;
  /**
   * Complete child system prompt. `undefined` keeps Pi's native prompt; ambient `SYSTEM.md`
   * and `APPEND_SYSTEM.md` files are never loaded either way.
   */
  readonly systemPrompt: string | undefined;
  /** Instruction files to supply as context files; default none. */
  readonly instructionFiles?: readonly AgentRunInstructionFile[];
  /** Load Pi codemode in `on` mode with auxiliary models. */
  readonly codemode?: boolean;
  /** Session-provided Web tools and the subset this child receives. */
  readonly webTools?: {
    readonly provision: ChildWebToolProvision;
    readonly toolNames: readonly ChildWebToolName[];
  };
  /** Caller-owned extensions, such as headless Code Intelligence or package tools. */
  readonly extensions?: readonly InlineExtension[];
}

/** Resource and settings policy for one isolated Agent Run. */
export interface IsolatedAgentResources {
  readonly resourceLoader: DefaultResourceLoader;
  readonly settingsManager: SettingsManager;
  readonly agentDir: string;
}

/** Return the Pi agent directory used by the current Pi installation. */
export function resolveAgentRunAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || getAgentDir();
}

/**
 * Build the resources of one isolated Agent Run: no ambient extensions, skills, prompt
 * templates, themes, context files, or discovered system prompts. Every child gets shell
 * hints and the active tools' usage rules, which Pi omits under a custom prompt. Compaction
 * is a safety net for a full context window and retries ride out transient provider
 * failures; the runtime records each compaction of a registered run as a Debug event.
 *
 * Callers own the prompt, the instruction files, and the capability-bearing extensions.
 */
export function createIsolatedAgentResources(
  options: IsolatedAgentResourceOptions,
): IsolatedAgentResources {
  const agentDir = options.agentDir ?? resolveAgentRunAgentDir();
  const settingsManager = SettingsManager.inMemory(
    { compaction: { enabled: true }, retry: { enabled: true } },
    { projectTrusted: options.projectTrusted },
  );
  const instructionFiles = (options.instructionFiles ?? []).map((file) => ({
    path: file.path,
    content: file.content,
  }));
  const webToolNames = options.webTools?.toolNames ?? [];
  const extensionFactories: InlineExtension[] = [
    { name: "supi-shell-hints", factory: registerShellHints },
    { name: "supi-agent-tool-rules", factory: registerToolRules },
    ...(options.extensions ?? []),
    ...(options.codemode ? [createCodemodeExtension({ models: true, mode: "on" })] : []),
    ...(options.webTools && webToolNames.length > 0
      ? [
          {
            name: "supi-web-child",
            factory: options.webTools.provision.createFactory(webToolNames),
          },
        ]
      : []),
  ];
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    extensionFactories,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    agentsFilesOverride: () => ({ agentsFiles: instructionFiles }),
    // A literal sentinel source keeps Pi from discovering ambient SYSTEM.md files.
    systemPrompt: options.systemPrompt ?? "",
    appendSystemPrompt: [],
    systemPromptOverride: () => options.systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  return { resourceLoader, settingsManager, agentDir };
}
