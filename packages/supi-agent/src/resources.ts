import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  getAgentDir,
  loadProjectContextFiles,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSessionInputs } from "@mrclrchtr/supi-agent-runtime/api";
import headlessInspectionProfile from "@mrclrchtr/supi-code-intelligence/headless";
import { toAgentToolNames, usesHeadlessInspection } from "./capabilities.ts";
import { realpathOrResolve } from "./path.ts";
import type { AgentProfile, AgentSessionInputOptions, AgentSystemPrompt } from "./types.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageProfilesRoot = resolve(packageRoot, "profiles");

/** Build an in-memory, ambient-resource-free session policy for one profile. */
export function createAgentSessionInputs(options: AgentSessionInputOptions): AgentSessionInputs {
  const settingsManager = SettingsManager.inMemory(
    {
      compaction: { enabled: true },
      retry: { enabled: true },
    },
    { projectTrusted: options.projectTrusted },
  );
  const contextFiles = selectInstructionFiles(options.profile, options.cwd, options.agentDir);
  const systemPrompt = resolveSystemPrompt(options.profile);
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
    noExtensions: true,
    ...(usesHeadlessInspection(options.profile.manifest.tools)
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
    agentsFilesOverride: () => ({ agentsFiles: contextFiles }),
    // Supply a literal sentinel source so PI does not discover ambient SYSTEM.md files.
    systemPrompt: systemPrompt ?? "",
    appendSystemPrompt: [],
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });

  return {
    cwd: options.cwd,
    model: options.model,
    providerAuthority: options.providerAuthority,
    thinkingLevel: options.thinkingLevel,
    tools: Object.freeze(toAgentToolNames(options.profile.manifest.tools)),
    resourceLoader: loader,
    settingsManager,
    agentDir: options.agentDir,
  };
}

/** Return the agent directory used by the current PI installation. */
export function resolveAgentDirectory(): string {
  return process.env.PI_CODING_AGENT_DIR || getAgentDir();
}

/** Select only the explicitly requested global/project instruction files. */
export function selectInstructionFiles(
  profile: AgentProfile,
  cwd: string,
  agentDir: string,
): Array<{ path: string; content: string }> {
  const scopes = new Set(profile.manifest.instructionScopes);
  if (scopes.size === 0) return [];
  const resolvedAgentDir = realpathOrResolve(agentDir);
  const files = loadProjectContextFiles({ cwd, agentDir });
  return files.filter((file) => {
    const isGlobal = realpathOrResolve(dirname(file.path)) === resolvedAgentDir;
    return (isGlobal && scopes.has("global")) || (!isGlobal && scopes.has("project"));
  });
}

/** Resolve a complete prompt from the profile's independent prompt policy. */
export function resolveSystemPrompt(profile: AgentProfile): string | undefined {
  const selector = profile.manifest.systemPrompt;
  if (selector === "native") return undefined;
  if (selector === "custom") return profile.customSystemPrompt;
  return readPackagePrompt(selector);
}

function readPackagePrompt(selector: AgentSystemPrompt): string {
  const id = selector.slice("supi:".length);
  return readFileSync(resolve(packageProfilesRoot, id, "SYSTEM.md"), "utf8");
}

/** Human-readable package prompt asset path, kept out of model-facing diagnostics. */
export function packagePromptPath(
  selector: Exclude<AgentSystemPrompt, "native" | "custom">,
): string {
  return resolve(packageProfilesRoot, selector.slice("supi:".length), "SYSTEM.md");
}
