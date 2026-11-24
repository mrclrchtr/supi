import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectContextFiles } from "@earendil-works/pi-coding-agent";
import {
  type AgentSessionInputs,
  createIsolatedAgentResources,
  resolveAgentRunAgentDir,
} from "@mrclrchtr/supi-agent-runtime/api";
import headlessInspectionProfile from "@mrclrchtr/supi-code-intelligence/headless";
import {
  effectiveCapabilities,
  selectedWebCapabilities,
  toAgentToolNames,
  usesHeadlessInspection,
} from "./capabilities.ts";
import { realpathOrResolve } from "./path.ts";
import { registerGitTool } from "./tool/git/register.ts";
import type { AgentProfile, AgentSessionInputOptions, AgentSystemPrompt } from "./types.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageProfilesRoot = resolve(packageRoot, "profiles");

/** Build an in-memory, ambient-resource-free session policy for one profile. */
export function createAgentSessionInputs(options: AgentSessionInputOptions): AgentSessionInputs {
  const profileTools = options.profile.manifest.tools;
  const webTools = selectedWebCapabilities(profileTools).filter((tool) =>
    options.webTools?.toolNames.includes(tool),
  );
  const tools = effectiveCapabilities(profileTools, webTools);
  const { resourceLoader, settingsManager } = createIsolatedAgentResources({
    cwd: options.cwd,
    agentDir: options.agentDir,
    projectTrusted: options.projectTrusted,
    systemPrompt: resolveSystemPrompt(options.profile),
    instructionFiles: selectInstructionFiles(options.profile, options.cwd, options.agentDir),
    codemode: profileTools.includes("codemode"),
    ...(options.webTools ? { webTools: { provision: options.webTools, toolNames: webTools } } : {}),
    extensions: [
      ...(usesHeadlessInspection(profileTools)
        ? [{ name: "supi-code-intelligence-headless", factory: headlessInspectionProfile }]
        : []),
      ...(profileTools.includes("git")
        ? [{ name: "supi-agent-git", factory: registerGitTool }]
        : []),
    ],
  });

  return {
    cwd: options.cwd,
    model: options.model,
    providerAuthority: options.providerAuthority,
    thinkingLevel: options.thinkingLevel,
    tools: Object.freeze(toAgentToolNames(tools)),
    resourceLoader,
    settingsManager,
    agentDir: options.agentDir,
  };
}

/** Return the agent directory used by the current Pi installation. */
export function resolveAgentDirectory(): string {
  return resolveAgentRunAgentDir();
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
