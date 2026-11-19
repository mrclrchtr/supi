import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Box, Markdown, Text } from "@earendil-works/pi-tui";

/** Custom message type of the retrospective prompt on the side branch. */
export const TOOLING_RETRO_PROMPT_TYPE = "supi-tooling-retro-prompt";
/** Custom entry (outside LLM context) that shows the report on the main branch. */
export const TOOLING_RETRO_REPORT_TYPE = "supi-tooling-retro-report";

/** Data of the report entry shown on the main branch after the retrospective. */
export interface ToolingRetroReportData {
  readonly text: string;
  /** Whether the report was also recorded as a Debug event. */
  readonly stored: boolean;
}

function isReportData(value: unknown): value is ToolingRetroReportData {
  const data = value as Partial<ToolingRetroReportData> | undefined;
  return typeof data?.text === "string" && typeof data.stored === "boolean";
}

/** Drop the prompt's leading report heading; the entry header already names the report. */
export function withoutReportHeading(text: string): string {
  return text.replace(/^\s*#{1,6}\s*SuPi Tooling Retrospective\s*(?:\r?\n)+/i, "");
}

/**
 * Render the long retrospective prompt as one line and the report entry as
 * Markdown. The report entry is a custom entry, so it never reaches LLM context.
 */
export function registerToolingRetroRenderers(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(TOOLING_RETRO_PROMPT_TYPE, (_message, options, theme) => {
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(
      new Text(
        `${theme.fg("toolTitle", "Tooling Retrospective")} ${theme.fg("dim", "assessing the preceding task on a side branch")}`,
        0,
        0,
      ),
    );
    return box;
  });

  pi.registerEntryRenderer(TOOLING_RETRO_REPORT_TYPE, (entry, _options, theme) => {
    if (!isReportData(entry.data)) return undefined;
    const box = new Box(1, 0, undefined);
    const note = entry.data.stored
      ? "stored as a Debug event · not in the agent's context"
      : "not stored · not in the agent's context";
    box.addChild(
      new Text(`${theme.fg("toolTitle", "Tooling Retrospective")} ${theme.fg("dim", note)}`, 0, 0),
    );
    box.addChild(new Markdown(withoutReportHeading(entry.data.text), 0, 0, getMarkdownTheme()));
    return box;
  });
}
