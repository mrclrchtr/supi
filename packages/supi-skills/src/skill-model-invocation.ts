import {
  type BuildSystemPromptOptions,
  formatSkillsForPrompt,
} from "@earendil-works/pi-coding-agent";
import {
  loadSupiConfigSectionForScope,
  removeSupiConfigKey,
  writeSupiConfig,
} from "@mrclrchtr/supi-core/config";
import type { SettingsScope, ValueSource } from "@mrclrchtr/supi-core/settings";

const CONFIG_SECTION = "skill-states";
const MODEL_INVOCATION_KEY = "modelInvocation";

export const ENABLED = "Enabled";
export const MODEL_DISABLED = "Model invocation disabled";
export const DISABLED = "Disabled";

function invocationMap(
  scope: SettingsScope,
  cwd: string,
  homeDir?: string,
): Record<string, boolean> {
  const section = loadSupiConfigSectionForScope(CONFIG_SECTION, cwd, { scope, homeDir });
  const value = section?.[MODEL_INVOCATION_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

interface InvocationOptions {
  name: string;
  scope: SettingsScope;
  cwd: string;
  homeDir?: string;
}

interface ResolveInvocationOptions extends InvocationOptions {
  sourceDefault: boolean;
  projectTrusted: boolean;
}

/** Resolve a scoped model-invocation preference without reading untrusted project config. */
export function resolveInvocation({
  name,
  sourceDefault,
  scope,
  cwd,
  projectTrusted,
  homeDir,
}: ResolveInvocationOptions): { disabled: boolean; source: ValueSource } {
  if (scope === "project" && projectTrusted) {
    const project = invocationMap("project", cwd, homeDir);
    if (Object.hasOwn(project, name)) {
      return { disabled: project[name] ?? sourceDefault, source: "project" };
    }
  }
  const global = invocationMap("global", cwd, homeDir);
  if (Object.hasOwn(global, name)) {
    return { disabled: global[name] ?? sourceDefault, source: "global" };
  }
  return { disabled: sourceDefault, source: "default" };
}

/** Set or remove one scoped model-invocation preference. */
export function persistInvocation({
  name,
  disabled,
  scope,
  cwd,
  homeDir,
}: InvocationOptions & { disabled: boolean | undefined }): void {
  const values = invocationMap(scope, cwd, homeDir);
  if (disabled === undefined) delete values[name];
  else {
    Object.defineProperty(values, name, {
      value: disabled,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (Object.keys(values).length === 0) {
    removeSupiConfigKey({ section: CONFIG_SECTION, scope, cwd }, MODEL_INVOCATION_KEY, {
      homeDir,
    });
    return;
  }
  writeSupiConfig(
    { section: CONFIG_SECTION, scope, cwd },
    { [MODEL_INVOCATION_KEY]: values },
    { homeDir },
  );
}

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
