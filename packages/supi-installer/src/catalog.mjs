import { skillsCommand } from "./skills.mjs";

/** @param {string} name @param {string} description @param {string[]} labels @param {boolean} [recommended] @returns {import('./types.ts').CatalogItem} */
function item(name, description, labels, recommended = false) {
  return { name: `supi-${name}`, description, labels, recommended };
}

/** Obsolete direct declarations and what replaces them, if anything. */
const obsoleteReplacements = {
  agents: "Install supi-agent instead.",
  rtk: undefined,
  lsp: "Bundled by supi-code-intelligence.",
  "tree-sitter": "Bundled by supi-code-intelligence.",
  "bash-timeout": "Merged into supi-extras.",
  cache: "Merged into supi-debug.",
  "claude-md": `Skills moved to skills.sh: ${skillsCommand(["claude-md-improver", "claude-md-revision"])} (add -g for Global).`,
};

/** The only installable package catalog. Preset membership is explicit. */
export const catalog = [
  item("agent", "Profile-based foreground Agent Runs", ["Beta", "Agent"]),
  item("ask-user", "Structured choice and text forms", ["Agent"], true),
  item("code-intelligence", "Code navigation, diagnostics, and refactoring", ["Agent"], true),
  item("consulting", "Bounded external agent consultations", ["Beta", "Opt-in", "Agent"]),
  item("context", "Context pressure and token-use reports", ["Human"], true),
  item("debug", "Debug events, cache forensics, and tool feedback", ["DevTool"]),
  item("extras", "Session controls, shortcuts, and bash timeouts", ["Human"], true),
  item("insights", "Historical session reports", ["Beta", "Human"]),
  item("prompt-improver", "User-approved prompt improvement", ["Human"]),
  item("prompt-suggestions", "Optional model-powered ghost text", ["Human"], true),
  item("review", "Inspection-only reviews of Git targets", ["Beta", "Agent"]),
  item("settings", "Shared project and global settings UI", ["Human"], true),
  item("skills", "Scoped skill controls and shortcuts", ["Human"], true),
  item("web", "Public web pages, search, and library docs", ["Agent"], true),
  ...Object.entries(obsoleteReplacements).map(([name, replacement]) => ({
    ...item(name, "Obsolete direct installation; removal only", ["Removal only"]),
    obsolete: true,
    ...(replacement ? { replacement } : {}),
  })),
];
