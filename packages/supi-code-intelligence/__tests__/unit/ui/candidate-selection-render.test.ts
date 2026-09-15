import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { renderOrientationResult } from "../../../src/tool/code_orientation/tui.ts";
import { renderResolveResult } from "../../../src/tool/code_resolve/tui.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

function candidateResult(key: string, partial = false): ToolResult {
  const evidence = {
    key,
    shownCount: 1,
    totalCount: partial ? null : 2,
    omittedCount: 1,
    partialReason: partial ? "provider-limited" : null,
  };
  const resolve = key === "resolve.candidates";
  return {
    content: [{ type: "text", text: "Agent content is not candidate metadata." }],
    details: {
      type: resolve ? "resolve" : "context",
      status: resolve ? "disambiguation" : "completed",
      message: resolve
        ? "Multiple target matches require one candidate."
        : "Multiple Orientation targets require one candidate.",
      data: {
        confidence: "semantic",
        evidenceLists: [evidence],
        nextQueries: resolve
          ? ["Choose one candidate handle, or narrow the symbol selector with scope or symbolKind"]
          : ["Use one candidate handle as focus.target.handle"],
      },
      displaySections: [
        { ...evidence, title: "Candidates", lines: ["tg-visible — work at a.ts:1:10"] },
      ],
    },
  };
}

describe("candidate selection rendering", () => {
  it("keeps the old body when evidence has no display rows", () => {
    const result = candidateResult("resolve.candidates");
    if (!result.details) throw new Error("Expected details");
    delete result.details.displaySections;
    result.content = [{ type: "text", text: "Legacy candidate details" }];

    const text = renderResolveResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("Choose a target");
    expect(text).toContain("Legacy candidate details");
    expect(text).not.toContain("Candidates (1 of 2");
    expect(text).not.toContain("tg-visible");
  });

  it("retains the old Orientation kind-mismatch reason without structured reason fields", () => {
    const result = candidateResult("orientation.candidates");
    if (!result.details) throw new Error("Expected details");
    delete result.details.message;
    delete result.details.data.resultKind;
    delete result.details.data.requestedKind;
    result.content = [
      {
        type: "text",
        text:
          "# No Orientation target matched provider kind `class`\n\n" +
          "1. **work** (`Function`) — `a.ts`:1:10 — `tg-visible`\n\n" +
          "_(showing 1 of 2; 1 omitted)_",
      },
    ];

    const text = renderOrientationResult(
      result,
      { expanded: true, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");

    expect(text).toContain("provider kind");
    expect(text).toContain("class");
    expect(text).toContain("Use one candidate handle as focus.target.handle");
    expect(text.match(/Use one candidate handle as focus\.target\.handle/g)).toHaveLength(1);
  });

  it("keeps a legacy Graph kind-mismatch body when guidance is not structured", () => {
    const result: ToolResult = {
      content: [
        {
          type: "text",
          text:
            "**No target matched provider kind `class`. Near matches:**\n\n" +
            "- `tg-visible` — work (`Function`) at a.ts:1:10\n\n" +
            "1 of 2 candidates shown; 1 omitted",
        },
      ],
      details: {
        type: "search",
        status: "invalid-input",
        message: "No target matched provider kind class.",
        data: {
          confidence: "semantic",
          evidenceLists: [
            {
              key: "graph.candidates",
              shownCount: 1,
              totalCount: 2,
              omittedCount: 1,
              partialReason: null,
            },
          ],
        },
      },
    };

    const component = renderGraphResult(
      result,
      { expanded: true, isPartial: false },
      theme,
      undefined,
    );
    const text = component.render(120).join("\n");

    expect(text).toContain("provider kind");
    expect(text).toContain("class");
    expect(text.match(/1 of 2/g)).toHaveLength(1);
    expect(text.match(/1 omitted/g)).toHaveLength(1);
    expect(text).not.toContain("Candidates (1 of 2");
    expect(text).not.toContain("Choose one candidate handle, or narrow");
    for (const width of [40, 80, 120]) {
      expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  });

  it("keeps structured Graph facts when a legacy fallback has no content", () => {
    const result: ToolResult = {
      content: [],
      details: {
        type: "search",
        status: "disambiguation",
        message: "The target is ambiguous.",
        data: {
          confidence: "semantic",
          evidenceLists: [
            {
              key: "graph.candidates",
              shownCount: 1,
              totalCount: 2,
              omittedCount: 1,
              partialReason: null,
            },
          ],
        },
      },
    };

    const text = renderGraphResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("Candidates (1 of 2; 1 omitted)");
    expect(text).toContain("Choose one candidate handle");
  });

  it("keeps progress and PI execution failure precedence over selection", () => {
    const result = candidateResult("resolve.candidates");
    expect(
      renderResolveResult(result, { expanded: true, isPartial: true }, theme, { isError: true })
        .render(120)
        .join("\n")
        .trimEnd(),
    ).toBe("Resolving…");
    expect(
      renderResolveResult(result, { expanded: true, isPartial: false }, theme, { isError: true })
        .render(120)
        .join("\n"),
    ).toContain("code_resolve failed");

    const orientation = candidateResult("orientation.candidates");
    expect(
      renderOrientationResult(orientation, { expanded: true, isPartial: true }, theme, {
        isError: true,
      })
        .render(120)
        .join("\n")
        .trimEnd(),
    ).toBe("Orienting…");
    expect(
      renderOrientationResult(orientation, { expanded: true, isPartial: false }, theme, {
        isError: true,
      })
        .render(120)
        .join("\n"),
    ).toContain("code_orientation failed");
  });

  it("keeps candidate truncation links and width-safe invalidation", () => {
    const result = candidateResult("resolve.candidates");
    if (!result.details) throw new Error("Expected details");
    result.details.truncation = {
      truncated: false,
      displayTruncated: true,
      fullOutputPath: "/tmp/full-candidate-output.txt",
    };
    result.details.displaySections = [
      {
        key: "resolve.candidates",
        title: "Candidates",
        lines: ["candidate-".repeat(80)],
        shownCount: 1,
        totalCount: 1,
        omittedCount: 0,
        partialReason: null,
      },
    ];

    let prefix = "";
    const changingTheme = {
      fg: (_color: string, text: string) => `${prefix}${text}`,
      bold: (text: string) => text,
    } as never;
    const component = renderResolveResult(
      result,
      { expanded: true, isPartial: false },
      changingTheme,
      undefined,
    );
    for (const width of [40, 80, 120]) {
      const rows = component.render(width);
      expect(rows.every((row) => row.length <= width)).toBe(true);
      expect(rows.join("\n")).toContain("Display limited");
      expect(rows.join("\n")).toContain("/tmp/full-candidate-output.txt");
      component.invalidate();
      expect(component.render(width)).toEqual(rows);
    }
    prefix = "new-theme ";
    component.invalidate();
    expect(component.render(80).join("\n")).toContain("new-theme");
  });

  it("renders candidate rows from structured fields when display rows are absent", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Structured candidate result" }],
      details: {
        type: "resolve",
        status: "disambiguation",
        data: {
          resultKind: "disambiguation",
          candidates: [
            {
              targetId: "tg-structured",
              name: "work",
              kind: "Function",
              file: "src/work.ts",
              line: 4,
              character: 10,
              rank: 1,
            },
          ],
          nextQueries: ["Use the structured handle"],
        },
      },
    };

    const text = renderResolveResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("tg-structured");
    expect(text).toContain("Use the structured handle");
    expect(text).not.toContain("Structured candidate result");
  });

  it.each([
    {
      key: "graph.candidates" as const,
      expected: "tg-structured — work (Function) at src/work.ts:4:10",
    },
    {
      key: "resolve.candidates" as const,
      expected: "1. work (Function) — src/work.ts:4:10 [tg-structured]",
    },
    {
      key: "orientation.candidates" as const,
      expected: "1. work (Function) — src/work.ts:4:10 [tg-structured]",
    },
  ])("uses the public $key row format for structured fallback", (case_) => {
    const render =
      case_.key === "graph.candidates"
        ? renderGraphResult
        : case_.key === "resolve.candidates"
          ? renderResolveResult
          : renderOrientationResult;
    const result: ToolResult = {
      content: [{ type: "text", text: "Legacy candidate body" }],
      details: {
        type: case_.key === "resolve.candidates" ? "resolve" : "context",
        status: case_.key === "graph.candidates" ? "disambiguation" : "completed",
        message:
          case_.key === "graph.candidates"
            ? "The target is ambiguous."
            : case_.key === "resolve.candidates"
              ? "Multiple target matches require one candidate."
              : "Multiple Orientation targets require one candidate.",
        data: {
          resultKind: "disambiguation",
          candidates: [
            {
              targetId: "tg-structured",
              name: "work",
              kind: "Function",
              file: "src/work.ts",
              line: 4,
              character: 10,
              rank: 1,
            },
          ],
          nextQueries: ["Use the structured handle"],
        },
      },
    };

    const text = render(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain(case_.expected);
    expect(text).not.toContain("Legacy candidate body");
  });

  it("uses structured evidence with structured rows when persisted display lines are empty", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Structured candidate result" }],
      details: {
        type: "resolve",
        status: "disambiguation",
        message: "Multiple target matches require one candidate.",
        data: {
          resultKind: "disambiguation",
          candidates: [
            {
              targetId: "tg-structured",
              name: "work",
              kind: "Function",
              file: "src/work.ts",
              line: 4,
              character: 10,
              rank: 1,
            },
          ],
          evidenceLists: [
            {
              key: "resolve.candidates",
              shownCount: 1,
              totalCount: 1,
              omittedCount: 0,
              partialReason: null,
            },
          ],
          nextQueries: ["Use the structured handle"],
        },
        displaySections: [
          {
            key: "resolve.candidates",
            title: "Candidates",
            lines: [],
            shownCount: 0,
            totalCount: 1,
            omittedCount: 1,
            partialReason: null,
          },
        ],
      },
    };

    const text = renderResolveResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("Candidates (1)");
    expect(text).toContain("1. work (Function) — src/work.ts:4:10 [tg-structured]");
  });

  it.each([
    { name: "missing result", result: { content: [] } as ToolResult },
    {
      name: "malformed candidate data",
      result: {
        content: [{ type: "text", text: "Legacy candidate body" }],
        details: {
          type: "context",
          status: "completed",
          data: { candidates: [{ name: "missing required fields" }] },
        },
      } as ToolResult,
    },
  ])("keeps %s safe without candidate inference", ({ result }) => {
    expect(() => {
      renderGraphResult(result, { expanded: true, isPartial: false }, theme, undefined).render(80);
      renderResolveResult(result, { expanded: true, isPartial: false }, theme, undefined).render(
        80,
      );
      renderOrientationResult(
        result,
        { expanded: true, isPartial: false },
        theme,
        undefined,
      ).render(80);
    }).not.toThrow();
  });

  it("keeps the old Graph body when candidate metadata is unavailable", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Legacy graph candidate details" }],
      details: {
        type: "search",
        status: "invalid-input",
        message: "The graph target is ambiguous.",
        data: {},
      },
    };

    const text = renderGraphResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("Invalid input: The graph target is ambiguous.");
    expect(text).toContain("Legacy graph candidate details");
  });

  it("keeps Graph progress and PI execution failure precedence over selection", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Graph selection Markdown" }],
      details: {
        type: "search",
        status: "invalid-input",
        message: "No target matched provider kind class.",
        data: {
          evidenceLists: [
            {
              key: "graph.candidates",
              shownCount: 1,
              totalCount: 1,
              omittedCount: 0,
              partialReason: null,
            },
          ],
        },
        displaySections: [
          {
            key: "graph.candidates",
            title: "Candidates",
            lines: ["tg-visible — work (Function) at a.ts:1:10"],
            shownCount: 1,
            totalCount: 1,
            omittedCount: 0,
            partialReason: null,
          },
        ],
      },
    };

    expect(
      renderGraphResult(result, { expanded: true, isPartial: true }, theme, { isError: true })
        .render(80)
        .join("\n"),
    ).toContain("Collecting relations");
    expect(
      renderGraphResult(result, { expanded: true, isPartial: false }, theme, { isError: true })
        .render(80)
        .join("\n"),
    ).toContain("code_graph failed");
  });
});
