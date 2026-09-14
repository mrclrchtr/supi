import { describe, expect, it } from "vitest";
import { type AgentRunBlock, AgentRunViewport } from "../../src/ui/agents-run-viewport.ts";

function blocks(count: number, omitted = 0): AgentRunBlock[] {
  return Array.from({ length: count }, (_, index) => ({
    key: omitted + index,
    lines: [`entry ${omitted + index}`],
  }));
}

describe("AgentRunViewport", () => {
  it("follows new rows and restores following when Page Down reaches the end", () => {
    const viewport = new AgentRunViewport();
    expect(viewport.render(blocks(12), 4)).toEqual(["entry 8", "entry 9", "entry 10", "entry 11"]);
    expect(viewport.render(blocks(13), 4)).toContain("entry 12");
    viewport.navigate("page-up");
    const paused = viewport.render(blocks(13), 4);
    expect(viewport.status).toContain("PAUSED");
    expect(viewport.render(blocks(15), 4)).toEqual(paused);
    expect(viewport.status).toContain("6 lines below");
    viewport.navigate("page-down");
    viewport.render(blocks(15), 4);
    expect(viewport.status).toContain("PAUSED");
    viewport.navigate("page-down");
    expect(viewport.render(blocks(15), 4)).toContain("entry 14");
    expect(viewport.status).toContain("LIVE");
    expect(viewport.render(blocks(16), 4)).toContain("entry 15");
  });

  it("pages within one long entry and follows appended lines in that entry", () => {
    const viewport = new AgentRunViewport();
    const entry = { key: 0, lines: Array.from({ length: 30 }, (_, index) => `line ${index}`) };
    expect(viewport.render([entry], 5)).toContain("line 29");
    viewport.navigate("page-up");
    expect(viewport.render([entry], 5)).toEqual(entry.lines.slice(20, 25));
    const longer = { ...entry, lines: [...entry.lines, "line 30"] };
    expect(viewport.render([longer], 5)).toEqual(entry.lines.slice(20, 25));
    viewport.navigate("end");
    expect(viewport.render([longer], 5)).toContain("line 30");
  });

  it("keeps the same retained entry when older entries are removed", () => {
    const viewport = new AgentRunViewport();
    viewport.render(blocks(20), 5);
    viewport.navigate("page-up");
    const paused = viewport.render(blocks(20), 5);
    expect(viewport.render(blocks(20, 3), 5)).toEqual(paused);
  });

  it("moves to the oldest retained entry when the reading anchor is removed", () => {
    const viewport = new AgentRunViewport();
    const metadata = { key: -2, lines: ["instructions"] };
    viewport.render([metadata, ...blocks(20)], 5);
    viewport.navigate("page-up");
    viewport.render([metadata, ...blocks(20)], 5);
    expect(viewport.render([metadata, ...blocks(20, 15)], 5)[0]).toBe("entry 15");
    expect(viewport.status).toContain("PAUSED");
  });

  it("supports start, end, and pause without new entries changing the mode", () => {
    const viewport = new AgentRunViewport();
    viewport.render(blocks(1), 5);
    viewport.navigate("start");
    viewport.render(blocks(2), 5);
    expect(viewport.status).toContain("PAUSED");
    viewport.navigate("toggle");
    expect(viewport.render(blocks(20), 5)).toContain("entry 19");
    viewport.navigate("toggle");
    const paused = viewport.render(blocks(20), 5);
    expect(viewport.render(blocks(21), 5)).toEqual(paused);
    viewport.reset();
    expect(viewport.render(blocks(21), 5)).toContain("entry 20");
    expect(viewport.status).toContain("LIVE");
  });

  it("keeps a paused entry when metadata grows and the viewport height changes", () => {
    const viewport = new AgentRunViewport();
    viewport.render([{ key: -2, lines: ["metadata"] }, ...blocks(20)], 5);
    viewport.navigate("page-up");
    viewport.render(blocks(20), 5);
    const content = [{ key: -2, lines: Array(20).fill("metadata") }, ...blocks(20)];
    expect(viewport.render(content, 3)).toEqual(["entry 10", "entry 11", "entry 12"]);
  });

  it("handles empty content, shorter entries, and removed content", () => {
    const viewport = new AgentRunViewport();
    expect(viewport.render([], 4)).toEqual([]);
    viewport.navigate("page-up");
    expect(viewport.render([], 4)).toEqual([]);
    viewport.reset();
    viewport.render([{ key: 0, lines: Array(20).fill("long entry") }], 4);
    viewport.navigate("toggle");
    expect(viewport.render([{ key: 0, lines: ["short entry"] }, ...blocks(20, 1)], 4)[0]).toBe(
      "short entry",
    );
    expect(viewport.render([], 4)).toEqual([]);
  });
});
