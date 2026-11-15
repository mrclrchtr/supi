import { Type } from "typebox";
import { TUI_RENDER_FORMATS, TUI_RENDER_MAX_WIDTH, TUI_RENDER_MIN_WIDTH } from "./input.ts";
import { tuiRenderOutputSchema } from "./result-schema.ts";

export const TUI_RENDER_TOOL_NAME = "tui_render";
export const TUI_RENDER_TOOL_LABEL = "TUI Render";

/**
 * Canonical provider-facing metadata for the tui_render tool. Execution is bound at
 * registration because it needs the extension's renderer observer and Pi settings.
 */
export const tuiRenderSpec = {
  name: TUI_RENDER_TOOL_NAME,
  label: TUI_RENDER_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: Type.Object(
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
          toolCallId: Type.Optional(
            Type.String({ minLength: 1, description: "Exact tool call id" }),
          ),
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
  ),
  outputSchema: tuiRenderOutputSchema,
  // Opt-in through the Debug setting `tuiRenderTool`; see `syncTuiRenderTool()`.
  defaultActive: false,
} as const;
