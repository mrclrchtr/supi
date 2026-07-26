import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STOCK_PI_DOCS_POLICY = `- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
const SUPI_PI_DOCS_POLICY = `- Read relevant sections of pi .md files; follow links to related docs (e.g., tui.md for TUI API details) when needed for the task.`;

/** Replaces Pi's generic documentation-reading policy with SuPi's evidence-scaled policy. */
export default function piDocsPolicy(pi: ExtensionAPI): void {
  let warned = false;

  pi.on("before_agent_start", (event, ctx) => {
    const systemPrompt = event.systemPrompt.replace(STOCK_PI_DOCS_POLICY, SUPI_PI_DOCS_POLICY);

    if (systemPrompt !== event.systemPrompt) {
      return { systemPrompt };
    }

    // A custom system prompt intentionally replaces Pi's stock prompt, so there is nothing to override.
    if (event.systemPromptOptions.customPrompt || warned) {
      return;
    }

    warned = true;
    ctx.ui.notify(
      "Pi docs policy override was not applied: the expected stock prompt text was not found. Review .pi/extensions/pi-docs-policy.ts.",
      "warning",
    );
  });
}
