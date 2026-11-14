import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import type { EvidenceListFacts } from "../../../src/analysis/evidence.ts";
import { createEvidenceList } from "../../../src/analysis/evidence.ts";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { renderOrientationResult } from "../../../src/tool/code_orientation/tui.ts";
import { renderResolveResult } from "../../../src/tool/code_resolve/tui.ts";
import { createToolDisplaySection } from "../../../src/tool/result/display.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

function displaySection(evidence: EvidenceListFacts, lines: string[]) {
  return { key: evidence.key, title: "Candidates", lines, evidence, displayOmittedCount: 0 };
}

function candidateResult(key: string, partial = false): ToolResult {
  const evidence: EvidenceListFacts = {
    key,
    completeness: partial ? "partial" : "capped",
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
      displaySections: [displaySection(evidence, ["tg-visible — work at a.ts:1:10"])],
    },
  };
}

describe("candidate summaries", () => {
  it.each([
    {
      name: "exact plural",
      lines: ["first", "second"],
      completeness: "complete" as const,
      shownCount: 2,
      totalCount: 2,
      omittedCount: 0,
      partialReason: null,
      expected: "2 candidates",
    },
    {
      name: "partial",
      lines: ["first"],
      completeness: "partial" as const,
      shownCount: 1,
      totalCount: null,
      omittedCount: 1,
      partialReason: "provider-limited" as const,
      expected: "1 candidate; 1 collected omitted; more may exist — provider-limited",
    },
    {
      name: "exact singular",
      lines: ["first"],
      completeness: "complete" as const,
      shownCount: 1,
      totalCount: 1,
      omittedCount: 0,
      partialReason: null,
      expected: "1 candidate",
    },
  ])("uses the human Graph candidate label for $name", (case_) => {
    const evidence: EvidenceListFacts = {
      key: "graph.candidates",
      completeness: case_.completeness,
      shownCount: case_.shownCount,
      totalCount: case_.totalCount,
      omittedCount: case_.omittedCount,
      partialReason: case_.partialReason,
    };
    const result: ToolResult = {
      content: [{ type: "text", text: "Graph selection content" }],
      details: {
        type: "search",
        status: "disambiguation",
        message: "The target is ambiguous.",
        data: {
          confidence: "semantic",
          evidenceLists: [evidence],
          nextQueries: ["Choose a handle"],
        },
        displaySections: [displaySection(evidence, case_.lines)],
      },
    };

    const text = renderGraphResult(result, { expanded: false, isPartial: false }, theme, undefined)
      .render(160)
      .join("\n");

    expect(text).toContain(case_.expected);
    expect(text).not.toContain("graph.candidates");
  });

  it.each(["resolve", "orientation"] as const)(
    "renders one structured expanded selection view for %s",
    (tool) => {
      const result = candidateResult(
        tool === "resolve" ? "resolve.candidates" : "orientation.candidates",
      );
      const render = tool === "resolve" ? renderResolveResult : renderOrientationResult;
      const text = render(result, { expanded: true, isPartial: false }, theme, undefined)
        .render(120)
        .join("\n");

      expect(text).toContain("Choose a target");
      expect(text).toMatch(/Candidates\s*\n1 of 2 candidates; 1 omitted\s*\n/);
      expect(text).toContain("tg-visible");
      expect(text).toContain(
        tool === "resolve" ? "Choose one candidate handle" : "Use one candidate handle",
      );
      expect(text).not.toContain("Agent content");
      expect(text.match(/1 of 2/g)).toHaveLength(1);
    },
  );

  it("renders one structured expanded selection view for graph kind mismatches", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "Agent graph selection Markdown" }],
      details: {
        type: "search",
        status: "invalid-input",
        message: "No target matched provider kind class.",
        data: {
          confidence: "semantic",
          evidenceLists: [
            {
              key: "graph.candidates",
              completeness: "capped",
              shownCount: 1,
              totalCount: 2,
              omittedCount: 1,
              partialReason: null,
            },
          ],
          nextQueries: ["Retry without symbolKind"],
        },
        displaySections: [
          displaySection(
            {
              key: "graph.candidates",
              completeness: "capped",
              shownCount: 1,
              totalCount: 2,
              omittedCount: 1,
              partialReason: null,
            },
            ["tg-visible — work (Function) at a.ts:1:10"],
          ),
        ],
      },
    };
    const text = renderGraphResult(result, { expanded: true, isPartial: false }, theme, undefined)
      .render(120)
      .join("\n");

    expect(text).toContain("Choose a target");
    expect(text).toContain("No target matched provider kind class.");
    expect(text).toContain("Retry without symbolKind");
    expect(text).not.toContain("Agent graph selection Markdown");
    expect(text.match(/1 of 2/g)).toHaveLength(1);
  });

  it.each(["disambiguation", "invalid-input"] as const)(
    "shows collapsed resolve omissions for %s",
    (status) => {
      const result = candidateResult("resolve.candidates");
      if (!result.details) throw new Error("Expected details");
      result.details.status = status;
      const text = renderResolveResult(
        result,
        { expanded: false, isPartial: false },
        theme,
        undefined,
      )
        .render(120)
        .join("\n");
      expect(text).toContain("1 of 2 candidates; 1 omitted");
      expect(text).not.toContain("Agent content");
      expect(text).not.toContain("tg-visible");
    },
  );

  it.each([false, true])(
    "keeps provider-limited resolve omissions when expanded=%s",
    (expanded) => {
      const result = candidateResult("resolve.candidates", true);
      const text = renderResolveResult(result, { expanded, isPartial: false }, theme, undefined)
        .render(160)
        .join("\n");
      expect(text).toContain("1 collected omitted");
      expect(text).toContain("more may exist");
      expect(text).not.toContain("of 2");
    },
  );

  it.each([false, true])(
    "uses a human candidate label for Orientation when expanded=%s",
    (expanded) => {
      const result = candidateResult("orientation.candidates");
      const text = renderOrientationResult(result, { expanded, isPartial: false }, theme, undefined)
        .render(160)
        .join("\n");
      if (expanded) expect(text).toMatch(/Candidates\s*\n1 of 2 candidates; 1 omitted\s*\n/);
      else expect(text).toContain("1 of 2 candidates; 1 omitted");
      expect(text).not.toContain("orientation.candidates");
    },
  );

  it.each(["resolve.candidates", "orientation.candidates"])(
    "uses a singular label for one provider-limited %s result",
    (key) => {
      const result = candidateResult(key, true);
      const render = key === "resolve.candidates" ? renderResolveResult : renderOrientationResult;
      const text = render(result, { expanded: false, isPartial: false }, theme, undefined)
        .render(160)
        .join("\n");
      expect(text).toContain("1 candidate; 1 collected omitted;");
      expect(text).not.toContain("1 candidates");
    },
  );

  it("shows complete resolve candidates without an omission warning", () => {
    const result = candidateResult("resolve.candidates");
    const section = result.details?.displaySections?.[0];
    if (!section) throw new Error("Expected candidate display section");
    result.details = {
      ...result.details,
      type: "resolve",
      data: {},
      displaySections: [
        {
          ...section,
          lines: ["first", "second"],
          evidence: {
            ...section.evidence,
            completeness: "complete",
            shownCount: 2,
            omittedCount: 0,
          },
        },
      ],
    };
    const text = renderResolveResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");
    expect(text).toContain("2 candidates");
    expect(text).not.toContain("omitted");
  });

  it("uses explicit evidence metadata when older results have no display metadata", () => {
    const result = candidateResult("resolve.candidates");
    if (!result.details) throw new Error("Expected details");
    delete result.details.displaySections;
    const text = renderResolveResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");
    expect(text).toContain("1 of 2 candidates; 1 omitted");
  });

  it("reports transcript row-cap hiding separately from evidence omissions", () => {
    const result = candidateResult("resolve.candidates");
    if (!result.details) throw new Error("Expected details");
    const evidence = createEvidenceList({
      key: "resolve.candidates",
      items: Array.from({ length: 30 }, (_, index) => `candidate ${index}`),
      maxResults: 25,
    });
    const section = createToolDisplaySection({
      title: "Candidates",
      items: evidence.items,
      evidence: evidence.metadata,
      format: (row) => row,
    });
    result.details.data.evidenceLists = [section.evidence];
    result.details.displaySections = [section];
    const collapsed = renderResolveResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");
    const expanded = renderResolveResult(
      result,
      { expanded: true, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");
    // Evidence counts stay canonical; the view cap is a separate Display omission.
    expect(collapsed).toContain("25 of 30 candidates; 5 omitted");
    expect(expanded).toContain("25 of 30 candidates; 5 omitted; 5 rows hidden in view");
    expect(expanded).toContain("candidate 19");
    expect(expanded).not.toContain("candidate 20");
    expect(expanded.match(/25 of 30/g)).toHaveLength(1);
  });

  it("does not invent counts from older details or unrelated validation rows", () => {
    const result: ToolResult = {
      content: [{ type: "text", text: "99 candidates" }],
      details: {
        type: "resolve",
        status: "invalid-input",
        message: "The file does not exist.",
        data: { candidateCount: 99 },
        displaySections: [
          {
            key: "resolve.error",
            title: "Reason",
            lines: ["Missing file"],
            evidence: {
              key: "resolve.error",
              completeness: "complete",
              shownCount: 1,
              totalCount: 1,
              omittedCount: 0,
              partialReason: null,
            },
            displayOmittedCount: 0,
          },
        ],
      },
    };
    const text = renderResolveResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      undefined,
    )
      .render(120)
      .join("\n");
    expect(text.trim()).toBe("Invalid input: The file does not exist.");
  });
});
