import { type Static, Type } from "typebox";
import {
  RENDERER_SLOTS,
  RENDERER_SOURCES,
  SHELL_BACKGROUNDS,
  SHELL_KINDS,
  TUI_RENDER_FORMATS,
} from "./input.ts";

const rendererSourceSchema = Type.Enum(RENDERER_SOURCES, { type: "string" });

/** Native structured result contract for the tui_render tool. */
export const tuiRenderOutputSchema = Type.Object({
  toolName: Type.String(),
  toolCallId: Type.String(),
  index: Type.Integer({ minimum: 0, description: "0 = latest result of this tool." }),
  matchCount: Type.Integer({ minimum: 1, description: "Results of this tool on the branch." }),
  isError: Type.Boolean(),
  format: Type.Enum(TUI_RENDER_FORMATS, { type: "string" }),
  width: Type.Integer({ minimum: 1 }),
  expanded: Type.Boolean(),
  renderer: Type.Object({ call: rendererSourceSchema, result: rendererSourceSchema }),
  shell: Type.Object({
    kind: Type.Enum(SHELL_KINDS, { type: "string" }),
    background: Type.Optional(Type.Enum(SHELL_BACKGROUNDS, { type: "string" })),
  }),
  rendererErrors: Type.Array(
    Type.Object({
      slot: Type.Enum(RENDERER_SLOTS, { type: "string" }),
      message: Type.String(),
    }),
    { description: "Renderer exceptions; Pi drew that slot with its generic fallback." },
  ),
  notes: Type.Array(Type.String()),
  lines: Type.Array(Type.String(), {
    description: "Rendered transcript row, one terminal line each.",
  }),
});

export type TuiRenderOutput = Static<typeof tuiRenderOutputSchema>;
