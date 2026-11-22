// Shell hints — tell the model which `sed` the bash tool runs.
//
// GNU and BSD sed disagree on in-place edits: GNU takes `sed -i 's/a/b/' file`, while BSD (macOS)
// requires a suffix argument, `sed -i '' 's/a/b/' file`. Agents guess wrong and retry. This hook
// probes `sed` the way the bash tool runs commands and adds one matching `<shell>` prompt section.

import { createLocalBashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Detected `sed` implementation. */
export type SedFlavor = "gnu" | "bsd";

/** Rule placed in the `<shell>` prompt section for each detected `sed` implementation. */
export const SED_RULES: Record<SedFlavor, string> = {
  gnu: "`sed` is GNU sed: write `sed -i 's/a/b/' file`, without the BSD `''` suffix argument.",
  bsd: "`sed` is BSD sed: `sed -i` needs a suffix argument (`sed -i '' 's/a/b/' file`), and GNU extensions such as `\\+`, `\\|`, and `--version` are unavailable.",
};

/** System prompt section that carries the `sed` rule, in native and custom prompts alike. */
export const SHELL_SECTION = "shell";

/**
 * Classify the combined output of `sed --version`. GNU sed prints its name; BSD sed rejects
 * `--version` as an illegal option. Anything else (BusyBox, missing `sed`) stays unknown.
 */
export function classifySed(exitCode: number | null, output: string): SedFlavor | undefined {
  if (exitCode === 0 && /\bGNU sed\b/.test(output)) return "gnu";
  if (exitCode !== 0 && /illegal option|usage: sed/i.test(output)) return "bsd";
  return undefined;
}

/** Bash tool settings that change which `sed` a command resolves to. */
interface ShellSettings {
  shellPath?: string;
  shellCommandPrefix?: string;
}

const PROBE_TIMEOUT_SECONDS = 5;
const sedProbes = new Map<string, Promise<SedFlavor | undefined>>();

/**
 * Run `sed --version` through Pi's local bash backend with the same shell path and command prefix
 * as the bash tool, so shell setup that changes `PATH` applies here too.
 */
async function probeSed(settings: ShellSettings, cwd: string): Promise<SedFlavor | undefined> {
  const { shellPath, shellCommandPrefix } = settings;
  const command = shellCommandPrefix ? `${shellCommandPrefix}\nsed --version` : "sed --version";
  const chunks: Buffer[] = [];
  const { exitCode } = await createLocalBashOperations({ shellPath }).exec(command, cwd, {
    onData: (data) => chunks.push(data),
    timeout: PROBE_TIMEOUT_SECONDS,
  });
  return classifySed(exitCode, Buffer.concat(chunks).toString("utf8"));
}

function detectSed(settings: ShellSettings, cwd: string): Promise<SedFlavor | undefined> {
  const key = JSON.stringify([settings.shellPath ?? "", settings.shellCommandPrefix ?? ""]);
  let probe = sedProbes.get(key);
  if (!probe) {
    probe = probeSed(settings, cwd).catch(() => undefined);
    sedProbes.set(key, probe);
  }
  return probe;
}

/**
 * Register a `before_agent_start` hook that tells the model which `sed` the bash tool runs, in a
 * `<shell>` system prompt section while bash is active. The probe uses the session's `shellPath`
 * and `shellCommandPrefix` settings and runs once per process for each combination, so the
 * section stays stable and keeps the prompt prefix cacheable. Child sessions with in-memory
 * settings probe their own bash setup. Usable directly as a child-session extension factory.
 */
export function registerShellHints(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    const options = event.systemPromptOptions;
    if (!options.selectedTools.includes("bash")) {
      delete options.sections[SHELL_SECTION];
      return;
    }
    const flavor = await detectSed(pi.getSettings(), ctx.cwd);
    if (flavor) options.sections[SHELL_SECTION] = `- ${SED_RULES[flavor]}`;
    else delete options.sections[SHELL_SECTION];
  });
}

/** Reset the cached `sed` probes. Test-only. */
export function resetSedProbeForTests(): void {
  sedProbes.clear();
}
