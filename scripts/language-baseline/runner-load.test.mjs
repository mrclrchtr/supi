import { describe, expect, it } from "vitest";
import { formatLoad, loadIntervals } from "./runner-load.mjs";

/** Cumulative counters of a 4-core runner; each interval adds 20 000 ms of core time. */
function sample(time, busy, idle) {
  return { time, cores: 4, busy, idle, load1: 1 };
}

describe("runner load summary", () => {
  it("derives busy cores from counter deltas, not from the cumulative totals", () => {
    const intervals = loadIntervals([
      sample(0, 1_000_000, 9_000_000),
      sample(5000, 1_010_000, 9_010_000),
      sample(10_000, 1_030_000, 9_010_000),
    ]);

    expect(intervals.map(({ busyCores }) => busyCores)).toEqual([2, 4]);
  });

  it("reports the average and the share of saturated samples", () => {
    const summary = formatLoad(
      loadIntervals([
        sample(0, 0, 0),
        sample(5000, 10_000, 10_000),
        sample(10_000, 30_000, 10_000),
      ]),
    );

    expect(summary).toContain("Average 3.0 of 4 cores busy (75%)");
    expect(summary).toContain("50% of the samples were at or above 90%");
  });

  it("skips intervals without elapsed core time instead of dividing by zero", () => {
    expect(loadIntervals([sample(0, 5, 5), sample(1, 5, 5)])).toEqual([]);
    expect(formatLoad([])).toContain("nothing to summarize");
  });
});
