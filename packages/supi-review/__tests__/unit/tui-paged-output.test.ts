import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderAuditCall, renderAuditResult } from "../../src/tool/review_audit/render.ts";
import { renderOutputCall, renderOutputResult } from "../../src/tool/review_output/render.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function rendered(component: { render(width: number): string[] }): string {
  return component
    .render(200)
    .map((line) => line.trimEnd())
    .join("\n");
}

describe("paged review tool TUI", () => {
  it("keeps output content out of the collapsed view and shows it when expanded", () => {
    const result = {
      content: [{ type: "text", text: "private review body" }],
      details: {
        kind: "review-output-page",
        artifactId: "review-output-1",
        offset: 12_000,
        nextOffset: 20_000,
        totalCharacters: 25_000,
      },
    };

    expect(
      rendered(renderOutputCall({ artifactId: "review-output-1", offset: 12_000 }, theme)),
    ).toContain("review_output review-output-1 — offset 12000");
    const collapsed = rendered(
      renderOutputResult(result, { expanded: false, isPartial: false }, theme),
    );
    expect(collapsed).toContain("12,000–20,000 of 25,000 chars · more available");
    expect(collapsed).not.toContain("private review body");
    expect(
      rendered(renderOutputResult(result, { expanded: true, isPartial: false }, theme)),
    ).toContain("private review body");
    expect(
      rendered(
        renderOutputResult(result, { expanded: false, isPartial: false }, theme, { isError: true }),
      ),
    ).toContain("review_output failed");
  });

  it("identifies outline, message, and raw audit views", () => {
    const modes = [
      ["outline", "Replay Outline", {}],
      ["message", "Replay message 3", { messageIndex: 3 }],
      ["raw", "Raw reviewer replay", {}],
    ] as const;
    for (const [mode, label, extra] of modes) {
      const result = {
        content: [{ type: "text", text: "private replay body" }],
        details: {
          kind: "review-audit",
          mode,
          artifactId: "review-audit-1",
          offset: 0,
          totalCharacters: 10,
          ...extra,
        },
      };
      expect(
        rendered(renderAuditResult(result, { expanded: false, isPartial: false }, theme)),
      ).toContain(label);
    }
    expect(rendered(renderAuditCall({ artifactId: "review-audit-1" }, theme))).toContain(
      "outline · offset 0",
    );
    expect(
      rendered(
        renderAuditCall({ artifactId: "review-audit-1", view: "message", messageIndex: 3 }, theme),
      ),
    ).toContain("message 3 · offset 0");
  });

  it("renders audit lists from structured details rather than agent-facing markdown", () => {
    const result = {
      content: [{ type: "text", text: "# agent-only replay list" }],
      details: {
        kind: "review-audit",
        mode: "list",
        audits: [{ artifactId: "review-audit-1", expiresAt: "2026-01-08T00:00:00.000Z" }],
      },
    };

    const collapsed = rendered(
      renderAuditResult(result, { expanded: false, isPartial: false }, theme),
    );
    expect(collapsed).toBe("1 local reviewer replay");
    expect(collapsed).not.toContain("agent-only");
    expect(
      rendered(renderAuditResult(result, { expanded: true, isPartial: false }, theme)),
    ).toContain("review-audit-1 expires 2026-01-08T00:00:00.000Z");
    expect(
      rendered(
        renderAuditResult(result, { expanded: false, isPartial: false }, theme, { isError: true }),
      ),
    ).toContain("review_audit failed");
  });
});
