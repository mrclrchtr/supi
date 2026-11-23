import { tuiRenderParameters } from "./input.ts";
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
  parameters: tuiRenderParameters,
  outputSchema: tuiRenderOutputSchema,
  // Opt-in through the Debug setting `tuiRenderTool`; see `syncTuiRenderTool()`.
  defaultActive: false,
} as const;
