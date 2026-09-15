import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../../src/tool/specs.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

const reason =
  "LSP request textDocument/references failed: Semantic input changed while the request was running.";

describe.each(CODE_INTELLIGENCE_TOOL_SPECS)("$name execution failure", (spec) => {
  it.each([false, true])("shows PI's failure reason when expanded=%s", (expanded) => {
    const result = { content: [{ type: "text", text: reason }] };
    const component = spec.renderResult(result, { expanded, isPartial: false }, theme, {
      isError: true,
    });
    const text = component.render(120).join("\n");
    expect(text).toContain(`${spec.name} failed`);
    expect(text).toContain(reason);
    expect(result).toEqual({ content: [{ type: "text", text: reason }] });
  });

  it("prefers structured failure text and ignores unrelated agent content", () => {
    const component = spec.renderResult(
      {
        content: [{ type: "text", text: "AGENT_SENTINEL" }],
        details: { type: "search", data: {}, message: "The server stopped." },
      },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    const text = component.render(80).join("\n");
    expect(text).toContain("The server stopped.");
    expect(text).not.toContain("AGENT_SENTINEL");
  });

  it.each([
    { content: [] },
    { content: undefined },
    { content: [{ type: "image" }] },
    { content: [null, { type: "text", text: 42 }] },
  ])("keeps a safe fallback for missing or malformed failure text: %j", ({ content }) => {
    const component = spec.renderResult(
      { content, details: { message: null } } as never,
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    expect(component.render(80).join("\n").trim()).toBe(`${spec.name} failed`);
  });
});

describe("execution failure display limits", () => {
  it.each([false, undefined])(
    "does not treat error-like content as execution failure with context=%s",
    (isError) => {
      const result = { content: [{ type: "text", text: reason }], isError: true };
      const component = renderGraphResult(
        result,
        { expanded: false, isPartial: false },
        theme,
        isError === undefined ? undefined : { isError },
      );
      expect(component.render(120).join("\n")).not.toContain(reason);
    },
  );

  it("keeps progress output separate from execution failures", () => {
    const component = renderGraphResult(
      { content: [{ type: "text", text: reason }] },
      { expanded: false, isPartial: true },
      theme,
      { isError: true },
    );
    const text = component.render(120).join("\n");
    expect(text).toContain("Collecting relations");
    expect(text).not.toContain(reason);
  });

  it("rebuilds theme formatting after invalidation", () => {
    let marker = "";
    const changingTheme = { fg: (_color: string, text: string) => `${marker}${text}` } as never;
    const component = renderGraphResult(
      { content: [{ type: "text", text: "The server stopped." }] },
      { expanded: true, isPartial: false },
      changingTheme,
      { isError: true },
    );
    expect(component.render(80).join("\n")).not.toContain("new-theme");
    marker = "new-theme ";
    component.invalidate();
    expect(component.render(80).join("\n")).toContain("new-theme");
  });

  it("wraps wide characters without exceeding the terminal width", () => {
    const component = renderGraphResult(
      { content: [{ type: "text", text: "失敗 🙂 ".repeat(1000) }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    const rows = component.render(40);
    expect(rows.length).toBeLessThanOrEqual(22);
    expect(rows.every((row) => visibleWidth(row) <= 40)).toBe(true);
    expect(rows.join("\n")).toContain("Failure text limited");
  });

  it.each([40, 80, 120])(
    "bounds wrapped failure text and discloses omissions at width %s",
    (width) => {
      const reason = "The server could not read the file. ".repeat(600);
      for (const expanded of [false, true]) {
        const result = { content: [{ type: "text", text: reason }] };
        const component = renderGraphResult(result, { expanded, isPartial: false }, theme, {
          isError: true,
        });
        const rows = component.render(width);
        expect(rows.length).toBeLessThanOrEqual(expanded ? 22 : 4);
        expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
        expect(rows.join("\n")).toContain("Failure text limited");
        component.invalidate();
        expect(component.render(width)).toEqual(rows);
        expect(result.content[0].text).toBe(reason);
      }
    },
  );

  it("retains multiple text blocks and line breaks in expanded failures", () => {
    const component = renderGraphResult(
      {
        content: [
          { type: "text", text: "The server stopped.\nRetry after startup." },
          { type: "text", text: "Enrollment retry failed after 1 retry." },
        ],
      },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    const rows = component.render(80).map((row) => row.trim());
    expect(rows).toContain("The server stopped.");
    expect(rows).toContain("Retry after startup.");
    expect(rows).toContain("Enrollment retry failed after 1 retry.");
  });

  it("removes bidirectional controls but retains joined characters", () => {
    const component = renderGraphResult(
      { content: [{ type: "text", text: "\u202eThe server\u202c stopped. 👩‍💻" }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    const text = component.render(80).join("\n");
    expect(text).not.toMatch(/\p{Bidi_Control}/u);
    expect(text).toContain("The server stopped. 👩‍💻");
  });

  it("removes terminal controls from plain failure text", () => {
    const component = renderGraphResult(
      { content: [{ type: "text", text: "\u001b[2JThe server\u0007 stopped." }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
    );
    const text = component.render(80).join("\n");
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\u0007");
    expect(text).toContain("The server stopped.");
  });
});
