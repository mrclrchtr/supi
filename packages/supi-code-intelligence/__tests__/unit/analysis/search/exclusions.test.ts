import { describe, expect, it } from "vitest";
import { describePartialQuery } from "../../../../src/analysis/search/exclusions.ts";

describe("describePartialQuery", () => {
  it("names two examples and writes an already canonical path once", () => {
    const text = describePartialQuery(
      "Excluded 3 results.",
      {
        automaticPathExclusion: {
          excludedCount: 3,
          examples: ["/outside/alias/a.d.ts", "dist/b.d.ts", "dist/c.d.ts"],
        },
      },
      "/project",
    );

    expect(text).toBe(
      "Excluded 3 results. Excluded path examples: `/outside/alias/a.d.ts`, `dist/b.d.ts`.",
    );
  });
});
