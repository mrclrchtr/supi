import {
  type BuildSystemPromptOptions,
  formatSkillsForPrompt,
} from "@earendil-works/pi-coding-agent";
import { recordDebugEvent, truncateDebugIdentity } from "@mrclrchtr/supi-core/debug";
import { resolveInvocation } from "./skill-model-invocation-config.ts";

export type { ModelInvocationState } from "./skill-model-invocation-config.ts";
export { persistInvocation, resolveInvocation } from "./skill-model-invocation-config.ts";
export { notifyInvocationConfigWarnings } from "./skill-model-invocation-warnings.ts";

export const ENABLED = "Enabled";
export const MODEL_DISABLED = "Model invocation disabled";
export const DISABLED = "Disabled";

/** Replace PI's rendered skills section while preserving the rest of a forced prompt. */
function replaceStructuredSkillsSection(
  systemPrompt: string,
  original: string,
  replacement: string,
): string | undefined {
  const content = original.trim();
  if (!content) return undefined;
  const currentSection = `<skills>\n${content}\n</skills>`;
  const start = systemPrompt.indexOf(currentSection);
  if (start < 0 || systemPrompt.indexOf(currentSection, start + currentSection.length) >= 0) {
    return undefined;
  }
  const replacementContent = replacement.trim();
  const section = replacementContent ? `<skills>\n${replacementContent}\n</skills>` : "";
  return `${systemPrompt.slice(0, start)}${section}${systemPrompt.slice(start + currentSection.length)}`;
}

/** Apply the effective scoped invocation state to PI's mutable prompt options. */
export function applyPromptOverrides({
  options,
  systemPrompt,
  cwd,
  projectTrusted,
  homeDir,
}: {
  options: BuildSystemPromptOptions;
  systemPrompt: string;
  cwd: string;
  projectTrusted: boolean;
  homeDir?: string;
}): string | undefined {
  const selectedTools = options.selectedTools;
  const skillFileReadTool =
    selectedTools === undefined
      ? "read"
      : (["read", "bash"] as const).find((tool) => selectedTools.includes(tool));
  if (!skillFileReadTool) return undefined;
  const skills = options.skills ?? [];
  const effective = skills.map((skill) => ({
    ...skill,
    disableModelInvocation: resolveInvocation({
      name: skill.name,
      sourceDefault: skill.disableModelInvocation,
      scope: "project",
      cwd,
      projectTrusted,
      homeDir,
    }).disabled,
  }));
  const original = formatSkillsForPrompt(skills, skillFileReadTool);
  const replacement = formatSkillsForPrompt(effective, skillFileReadTool);
  if (original === replacement) return undefined;

  // PI renders skills inside its structured <skills> section. Mutate the
  // normalized options so PI can render the replacement without byte matching
  // the already-rendered prompt.
  if (options.forceSystemPrompt === undefined) {
    options.skills = effective;
    return undefined;
  }

  const structuredPrompt = replaceStructuredSkillsSection(systemPrompt, original, replacement);
  if (structuredPrompt !== undefined) {
    options.skills = effective;
    options.forceSystemPrompt = structuredPrompt;
    return undefined;
  }

  if (!original) {
    const content = replacement.trim();
    options.skills = effective;
    return `${systemPrompt}${content ? `\n<skills>\n${content}\n</skills>` : ""}`;
  }

  recordDebugEvent({
    source: "supi-skills",
    level: "warning",
    category: "prompt-overrides",
    message: "Could not apply skill model-invocation overrides",
    cwd: truncateDebugIdentity(cwd),
    data: {
      skillCount: skills.length,
      changedSkills: skills
        .filter(
          (skill, index) =>
            skill.disableModelInvocation !== effective[index]?.disableModelInvocation,
        )
        .map((skill) => skill.name),
      forceSystemPrompt: true,
      hasSkillsSection: systemPrompt.includes("<skills>"),
      originalLength: original.length,
      replacementLength: replacement.length,
      systemPromptLength: systemPrompt.length,
    },
  });
  // biome-ignore lint/suspicious/noConsole: prompt mismatch must not fail silently
  console.warn("[supi-skills] Could not apply skill model-invocation overrides");
  return undefined;
}
