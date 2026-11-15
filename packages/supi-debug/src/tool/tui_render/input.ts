// Leaf vocabulary for tui_render: shared by its spec, result schema, and runtime modules.

/** Output formats: visible text, raw terminal colors, or theme-token markers. */
export const TUI_RENDER_FORMATS = ["plain", "ansi", "marked"] as const;
export type TuiRenderFormat = (typeof TUI_RENDER_FORMATS)[number];

/** Whether a renderer slot used the tool's own renderer or Pi's generic fallback. */
export const RENDERER_SOURCES = ["custom", "fallback"] as const;
export type RendererSource = (typeof RENDERER_SOURCES)[number];

/** Renderer slots of one transcript row. */
export const RENDERER_SLOTS = ["call", "result"] as const;
export type RendererSlot = (typeof RENDERER_SLOTS)[number];

/** How Pi frames the row: its own box, the tool's own framing, or the generic fallback text. */
export const SHELL_KINDS = ["default", "self", "fallback"] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];

/** Theme background tokens of a finished row's frame. */
export const SHELL_BACKGROUNDS = ["toolSuccessBg", "toolErrorBg"] as const;
export type ShellBackground = (typeof SHELL_BACKGROUNDS)[number];

/** Render width bounds; the default is the terminal width clamped to them, or 100 without one. */
export const TUI_RENDER_MIN_WIDTH = 20;
export const TUI_RENDER_MAX_WIDTH = 400;
export const TUI_RENDER_DEFAULT_WIDTH = 100;
