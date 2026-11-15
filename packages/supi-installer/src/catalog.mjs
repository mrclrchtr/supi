/** @param {string} name @param {string} description @param {string[]} labels @param {boolean} [recommended] @returns {import('./types.ts').CatalogItem} */
function item(name, description, labels, recommended = false) {
  return { name: `supi-${name}`, description, labels, recommended };
}

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
  ...["agents", "rtk", "lsp", "tree-sitter", "bash-timeout", "cache", "claude-md"].map((name) => ({
    ...item(name, "Obsolete direct installation; removal only", ["Removal only"]),
    obsolete: true,
  })),
];
