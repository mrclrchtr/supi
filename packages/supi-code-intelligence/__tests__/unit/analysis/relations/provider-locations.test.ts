import { describe, expect, it } from "vitest";
import { collectImplementations } from "../../../../src/analysis/relations/implementations.ts";
import { collectCallers } from "../../../../src/analysis/relations/references.ts";
import type { RelationsServiceDeps } from "../../../../src/analysis/relations/types.ts";

describe("provider relation locations", () => {
  it("normalizes, filters, partitions, and deduplicates reference locations", async () => {
    const cwd = "/repo with space";
    const targetFile = `${cwd}/src/target.ts`;
    const locations = [
      location("file:///repo%20with%20space/src/target.ts", 0, 16),
      location("file:///repo%20with%20space/src/use.ts", 4, 6),
      location("file:///repo%20with%20space/src/use.ts", 4, 6),
      location("file:///repo%20with%20space-other/src/use.ts", 2, 3),
    ];
    const deps: RelationsServiceDeps = {
      cwd,
      provider: { references: async () => locations },
    };

    const result = await collectCallers(targetFile, { line: 0, character: 16 }, "target", deps);

    expect(result).toMatchObject({
      references: [
        {
          file: "/repo with space/src/use.ts",
          line: 5,
          character: 7,
          name: "target",
        },
      ],
      externalCount: 1,
      invalidLocationCount: 0,
      partialReason: null,
    });
  });

  it("normalizes Windows-drive file URIs using Windows containment semantics", async () => {
    const cwd = "C:\\repo with space";
    const targetFile = `${cwd}\\src\\target.ts`;
    const locations = [
      location("file:///C:/repo%20with%20space/src/target.ts", 0, 4),
      location("file:///C:/repo%20with%20space/src/use.ts", 1, 2),
      location("file:///C:/repo%20with%20space-other/src/use.ts", 3, 5),
    ];
    const deps: RelationsServiceDeps = {
      cwd,
      provider: { references: async () => locations },
    };

    const result = await collectCallers(targetFile, { line: 0, character: 4 }, "target", deps);

    expect(result).toMatchObject({
      references: [
        {
          file: "C:\\repo with space\\src\\use.ts",
          line: 2,
          character: 3,
        },
      ],
      externalCount: 1,
    });
  });

  it("deduplicates normalized Windows locations independently of provider order", async () => {
    const cwd = "C:\\repo";
    const variants = [
      location("file:///C:/Repo/src/use.ts", 1, 2),
      location("file:///c:/repo/src/use.ts", 1, 2),
    ];
    const collect = (locations: typeof variants) =>
      collectCallers("C:\\repo\\src\\target.ts", { line: 0, character: 0 }, "target", {
        cwd,
        provider: { references: async () => locations },
      });

    const forward = await collect(variants);
    const reversed = await collect([...variants].reverse());

    expect(forward.references).toEqual(reversed.references);
    expect(forward.references).toHaveLength(1);
  });

  it("preserves, filters, partitions, and deduplicates implementation positions", async () => {
    const cwd = "/repo";
    const targetFile = `${cwd}/src/service.ts`;
    const locations = [
      location("file:///repo/src/service.ts", 0, 10),
      location("file:///repo/src/implementation.ts", 3, 8),
      location("file:///repo/src/implementation.ts", 3, 8),
      location("file:///repo-other/src/implementation.ts", 5, 12),
    ];
    const deps: RelationsServiceDeps = {
      cwd,
      provider: { implementation: async () => locations },
    };

    const result = await collectImplementations(
      targetFile,
      { line: 0, character: 10 },
      "Service",
      deps,
    );

    expect(result).toMatchObject({
      implementations: [
        {
          file: "/repo/src/implementation.ts",
          line: 4,
          character: 9,
          name: "Service",
        },
      ],
      externalCount: 1,
      invalidLocationCount: 0,
      partialReason: null,
    });
  });
});

function location(uri: string, line: number, character: number) {
  return {
    uri,
    range: {
      start: { line, character },
      end: { line, character: character + 1 },
    },
  };
}
