import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderResolveResult as renderResolveMarkdown } from "../../../src/tool/resolve/markdown.ts";
import { renderResolveResult as renderResolveTui } from "../../../src/tool/resolve/tui.ts";
import { assembleResolveResult } from "../../../src/tool/result/resolve.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

describe("code_resolve result rendering", () => {
  it("renders a no-symbol coordinate error with one TUI error label", () => {
    const message = "No symbol target resolved at `widget.ts:3:3` (on `comment`).";
    const assembly = assembleResolveResult({ kind: "invalid-input", message }, "/repo");
    const markdown = renderResolveMarkdown(assembly);
    const component = renderResolveTui(
      {
        content: [{ type: "text", text: markdown }],
        details: { type: "resolve", data: assembly.details as unknown as Record<string, unknown> },
      },
      { expanded: true, isPartial: false },
      testTheme,
      undefined,
    );

    const text = component.render(300).join("\n");
    expect(text).toContain("No symbol target resolved");
    expect(text.match(/Error:/g)).toHaveLength(1);
  });
});
