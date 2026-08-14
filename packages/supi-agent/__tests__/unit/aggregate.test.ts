import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AggregateSection,
  boundAggregateOutput,
  fairByteShares,
} from "../../src/tool/aggregate.ts";

function section(taskId: string, bodyLength: number): AggregateSection {
  return { overhead: `## ${taskId} — completed`, body: "x".repeat(bodyLength) };
}

function fits(text: string): boolean {
  return text.split("\n").length <= 2_000 && Buffer.byteLength(text, "utf-8") <= 51_200;
}

describe("fairByteShares", () => {
  it("splits the budget equally when every body needs more", () => {
    expect(fairByteShares([100, 100, 100], 60)).toEqual([20, 20, 20]);
  });

  it("redistributes unused shares to longer outputs", () => {
    expect(fairByteShares([5, 100], 50)).toEqual([5, 45]);
  });

  it("redistributes multiple small bodies to the single longer output", () => {
    expect(fairByteShares([10, 10, 80], 60)).toEqual([10, 10, 40]);
  });

  it("returns zero shares for an empty or zero budget", () => {
    expect(fairByteShares([], 50)).toEqual([]);
    expect(fairByteShares([10, 20], 0)).toEqual([0, 0]);
  });
});

describe("boundAggregateOutput", () => {
  it("passes the joined text unchanged when it fits both limits", () => {
    const sections = [section("t1", 100), section("t2", 200)];
    const output = boundAggregateOutput(sections);

    expect(output.truncated).toBe(false);
    expect(output.fullOutputPath).toBeUndefined();
    expect(output.text).toContain("## t1 — completed");
    expect(output.text).toContain("## t2 — completed");
    expect(output.text).toContain("x".repeat(200));
  });

  it("keeps every task header and bounds the result when bodies overflow", () => {
    const sections = [
      section("t1", 16_000),
      section("t2", 16_000),
      section("t3", 16_000),
      section("t4", 16_000),
    ];
    const output = boundAggregateOutput(sections);

    expect(output.truncated).toBe(true);
    expect(fits(output.text)).toBe(true);
    for (let i = 1; i <= 4; i++) {
      expect(output.text).toContain(`## t${i} — completed`);
    }
    // The complete joined Markdown is readable at the spill path.
    expect(output.fullOutputPath).toMatch(/supi-agent-/);
    const spill = readFileSync(output.fullOutputPath!, "utf-8");
    expect(fits(spill)).toBe(false);
    expect(spill).toContain("x".repeat(16_000));
    expect(spill).toContain("## t4 — completed");
  });

  it("appends an exact truncation marker with the original character count", () => {
    const sections = [
      section("t1", 16_000),
      section("t2", 16_000),
      section("t3", 16_000),
      section("t4", 16_000),
    ];
    const output = boundAggregateOutput(sections);

    expect(output.text).toContain("[truncated: 16,000 total characters]");
  });

  it("keeps short bodies whole and shortens only longer outputs", () => {
    const sections = [{ overhead: "## t1 — completed", body: "short body" }, section("t2", 60_000)];
    const output = boundAggregateOutput(sections);

    expect(output.text).toContain("short body");
    expect(output.text).toContain("[truncated:");
    expect(fits(output.text)).toBe(true);
  });

  it("respects the line limit when bodies are made of single-char lines", () => {
    const sections = Array.from({ length: 4 }, (_, i) => ({
      overhead: `## t${i + 1} — completed`,
      body: `${"y".repeat(40_000)}\n`,
    }));
    const output = boundAggregateOutput(sections);

    expect(output.truncated).toBe(true);
    expect(fits(output.text)).toBe(true);
    // Every section head remains after line trimming.
    for (let i = 1; i <= 4; i++) {
      expect(output.text).toContain(`## t${i} — completed`);
    }
    // The spill notice path is present and readable.
    expect(readFileSync(output.fullOutputPath!, "utf-8")).toContain("## t4 — completed");
  });

  it("does not truncate the joined result when only one task overflows modestly", () => {
    // 40,000 chars plus headers fit inside the 51,200-byte aggregate budget.
    const sections = [section("t1", 40_000)];
    const output = boundAggregateOutput(sections);

    expect(output.truncated).toBe(false);
    expect(output.text).toContain("x".repeat(40_000));
  });
});
