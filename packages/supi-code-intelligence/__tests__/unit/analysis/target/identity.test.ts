import { describe, expect, it } from "vitest";
import { declarationOccurrencesFor } from "../../../../src/analysis/target/identity.ts";

describe("declaration occurrence assignment", () => {
  it("orders duplicate declarations by source position in each identity group", () => {
    const later = candidate(40);
    const first = candidate(10);
    const middle = candidate(20);
    const otherContainer = candidate(15, "function", "Other");
    const otherKind = candidate(25, "class");

    expect(declarationOccurrencesFor([later, first, middle, otherContainer, otherKind])).toEqual([
      2, 0, 1, 0, 0,
    ]);
    expect(declarationOccurrencesFor([first, otherKind, middle, otherContainer, later])).toEqual([
      0, 0, 1, 0, 2,
    ]);
  });
});

function candidate(character: number, identityKind = "function", container: string | null = null) {
  return {
    name: "duplicate",
    identityKind,
    declarationAnchor: { line: 5, character },
    nameAnchor: { line: 5, character: character + 2 },
    container,
  };
}
