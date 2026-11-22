import { initTheme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderReportMessage } from "../../src/render.ts";

initTheme("dark");
const theme = { fg: (_color: string, text: string) => text } as never;
const message = {
  content: "12 sessions · 340 messages · 5h · 3 commits | 2026-11-01 to 2026-11-15",
  details: { summary: "## At a Glance\n\n**Quick wins:** batch reads\n\nfile:///tmp/report.html" },
};

describe("renderReportMessage", () => {
  it("shows only the stats line when collapsed", () => {
    const text = renderReportMessage(message, { expanded: false, outputPad: 0 }, theme)
      .render(120)
      .join("\n");
    expect(text).toContain("Pi Insights");
    expect(text).toContain("12 sessions");
    expect(text).not.toContain("Quick wins");
  });

  it("shows the summary and report link when expanded", () => {
    const text = renderReportMessage(message, { expanded: true, outputPad: 0 }, theme)
      .render(120)
      .join("\n");
    expect(text).toContain("Quick wins");
    expect(text).toContain("file:///tmp/report.html");
  });
});
