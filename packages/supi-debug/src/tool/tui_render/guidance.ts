// Prompt guidance and tool description for the tui_render tool.

export const toolDescription =
  "Render a tool result from the current session branch as Pi's TUI shows it, using the tool's real renderers and theme: collapsed or expanded, at a given width, as plain text, raw ANSI, or theme-token markers. Reads stored results only; it never runs the rendered tool. Use it to check or debug how any tool's output looks, for example after changing a renderer and running /reload.";

export const promptSnippet = "see how a tool result renders in the TUI";

export const promptGuidelines: string[] = [
  'Use tui_render with format "marked" to check tone (success, warning, error, dim) instead of asking the user for screenshots.',
];
