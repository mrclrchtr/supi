import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { ContextAnalysis } from "./analysis.ts";
import { formatContextReport } from "./format.ts";

export function registerContextRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("supi-context", (message, _renderOptions, theme) => {
    const analysis = (message.details as { analysis?: ContextAnalysis } | undefined)?.analysis;
    if (!analysis) {
      return new Text(theme.fg("dim", "No context analysis data"), 1, 0);
    }

    const lines = formatContextReport(analysis, theme);
    const container = new Container();

    for (const line of lines) {
      if (line === "") {
        container.addChild(new Spacer(1));
      } else {
        container.addChild(new Text(line, 0, 0));
      }
    }

    return container;
  });
}
