// Leaf vocabulary for tui_render: shared by its spec, result schema, and runtime modules.

import type { Static } from "typebox";
import { Type } from "typebox";

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

/** Parameter schema for tui_render, shared by its spec and execution. */
export const tuiRenderParameters = Type.Object(
  {
    target: Type.Object(
      {
        tool: Type.Optional(
          Type.Object(
            {
              name: Type.String({ minLength: 1, description: "Tool name, e.g. code_health" }),
              index: Type.Optional(
                Type.Integer({
                  minimum: 0,
                  description: "0 = latest result of this tool (default), 1 = the one before",
                }),
              ),
            },
            { additionalProperties: false },
          ),
        ),
        toolCallId: Type.Optional(Type.String({ minLength: 1, description: "Exact tool call id" })),
      },
      {
        description: "Exactly one: the latest results of a tool, or one tool call.",
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: false,
      },
    ),
    expanded: Type.Optional(
      Type.Boolean({ description: "Render the expanded view. Default: collapsed." }),
    ),
    width: Type.Optional(
      Type.Integer({
        minimum: TUI_RENDER_MIN_WIDTH,
        maximum: TUI_RENDER_MAX_WIDTH,
        description:
          "Render width in terminal columns. Default: the terminal width, clamped to the allowed range.",
      }),
    ),
    format: Type.Optional(
      Type.Enum(TUI_RENDER_FORMATS, {
        type: "string",
        description:
          "plain = visible text (default); ansi = raw terminal colors; marked = theme tokens such as [success]0[/success].",
      }),
    ),
  },
  { additionalProperties: false },
);

/** Validated tui_render parameters. */
export type TuiRenderParams = Static<typeof tuiRenderParameters>;
