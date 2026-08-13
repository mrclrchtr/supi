import {
  type BuildSystemPromptOptions,
  formatSkillsForPrompt,
} from "@earendil-works/pi-coding-agent";
import { resolveInvocation } from "./skill-model-invocation-config.ts";

export type { ModelInvocationState } from "./skill-model-invocation-config.ts";
export { persistInvocation, resolveInvocation } from "./skill-model-invocation-config.ts";
export { notifyInvocationConfigWarnings } from "./skill-model-invocation-warnings.ts";

export const ENABLED = "Enabled";
export const MODEL_DISABLED = "Model invocation disabled";
export const DISABLED = "Disabled";

/** Replace PI's generated skill block with the effective scoped invocation state. */
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
  if (options.selectedTools && !options.selectedTools.includes("read")) return undefined;
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
  const original = formatSkillsForPrompt(skills);
  const replacement = formatSkillsForPrompt(effective);
  if (original === replacement) return undefined;
  if (!original) return `${systemPrompt}${replacement}`;
  if (systemPrompt.includes(original)) return systemPrompt.replace(original, replacement);
  // biome-ignore lint/suspicious/noConsole: prompt mismatch must not fail silently
  console.warn("[supi-skills] Could not apply skill model-invocation overrides");
  return undefined;
}
