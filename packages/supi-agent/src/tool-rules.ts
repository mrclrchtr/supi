import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** System prompt section that carries the active tools' usage rules. */
export const TOOL_RULES_SECTION = "tool_rules";

/**
 * Child-session extension factory that restores per-tool usage rules for profiles with their
 * own system prompt. Pi builds its rules section only for its native prompt, so a package or
 * custom prompt would otherwise drop every tool's `promptGuidelines`.
 */
export function registerToolRules(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    // The native prompt already renders these rules.
    if (!options.customPrompt) return;
    const rules = new Set(
      options.selectedTools
        .filter((name) => !options.hiddenTools.includes(name))
        .flatMap((name) => options.toolGuidelines[name] ?? []),
    );
    if (rules.size === 0) delete options.sections[TOOL_RULES_SECTION];
    else options.sections[TOOL_RULES_SECTION] = [...rules].map((rule) => `- ${rule}`).join("\n");
  });
}
