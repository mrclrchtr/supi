import { describe, expect, it } from "vitest";
import {
  formatCodeActions,
  formatDocumentSymbols,
  formatHover,
  formatLocations,
  formatSymbolInformation,
  formatWorkspaceEdit,
  normalizeLocations,
} from "../format.ts";
import type {
  CodeAction,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  SymbolInformation,
  WorkspaceEdit,
} from "../types.ts";

const loc = (uri: string, line: number, char: number): Location => ({
  uri,
  range: { start: { line, character: char }, end: { line, character: char + 1 } },
});

describe("formatHover", () => {
  it("formats plain string", () => {
    const hover: Hover = { contents: "Hello" };
    expect(formatHover(hover)).toBe("Hello");
  });

  it("formats MarkupContent", () => {
    const hover: Hover = { contents: { kind: "markdown", value: "**bold**" } };
    expect(formatHover(hover)).toBe("**bold**");
  });

  it("formats MarkedString with language", () => {
    const hover: Hover = { contents: { language: "typescript", value: "const x = 1" } };
    expect(formatHover(hover)).toContain("```typescript");
    expect(formatHover(hover)).toContain("const x = 1");
  });

  it("formats array of MarkedStrings", () => {
    const hover: Hover = {
      contents: ["text", { language: "ts", value: "code" }],
    };
    const result = formatHover(hover);
    expect(result).toContain("text");
    expect(result).toContain("```ts");
  });
});

describe("formatLocations", () => {
  it("formats single location", () => {
    const result = formatLocations("Definition", [loc("file:///src/app.ts", 9, 4)]);
    expect(result).toContain("Definition:");
    expect(result).toContain("10:5");
  });

  it("formats multiple locations", () => {
    const locs = [loc("file:///src/a.ts", 0, 0), loc("file:///src/b.ts", 5, 3)];
    const result = formatLocations("References", locs);
    expect(result).toContain("2 locations");
    expect(result).toContain("1:1");
    expect(result).toContain("6:4");
  });
});

describe("normalizeLocations", () => {
  it("wraps single location in array", () => {
    const single = loc("file:///a.ts", 0, 0);
    const result = normalizeLocations(single);
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("file:///a.ts");
  });

  it("passes through Location array", () => {
    const locs = [loc("file:///a.ts", 0, 0), loc("file:///b.ts", 1, 1)];
    expect(normalizeLocations(locs)).toHaveLength(2);
  });

  it("converts LocationLink array", () => {
    const links: LocationLink[] = [
      {
        targetUri: "file:///target.ts",
        targetRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        targetSelectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      },
    ];
    const result = normalizeLocations(links);
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("file:///target.ts");
  });
});

describe("formatDocumentSymbols", () => {
  it("formats flat symbols", () => {
    const symbols: DocumentSymbol[] = [
      {
        name: "myFunc",
        kind: 12,
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
      },
    ];
    const result = formatDocumentSymbols(symbols, 0);
    expect(result).toContain("Function");
    expect(result).toContain("**myFunc**");
    expect(result).toContain("line 1");
  });

  it("formats nested symbols", () => {
    const symbols: DocumentSymbol[] = [
      {
        name: "MyClass",
        kind: 5,
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
        children: [
          {
            name: "method",
            kind: 6,
            range: { start: { line: 2, character: 2 }, end: { line: 5, character: 2 } },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 8 },
            },
          },
        ],
      },
    ];
    const result = formatDocumentSymbols(symbols, 0);
    expect(result).toContain("Class");
    expect(result).toContain("**MyClass**");
    expect(result).toContain("Method");
    expect(result).toContain("**method**");
  });
});

describe("formatSymbolInformation", () => {
  it("formats symbols with container", () => {
    const symbols: SymbolInformation[] = [
      {
        name: "handler",
        kind: 12,
        location: loc("file:///src/app.ts", 10, 0),
        containerName: "AppModule",
      },
    ];
    const result = formatSymbolInformation(symbols);
    expect(result).toContain("Function");
    expect(result).toContain("**handler**");
    expect(result).toContain("(in AppModule)");
  });
});

describe("formatWorkspaceEdit", () => {
  it("formats changes map", () => {
    const edit: WorkspaceEdit = {
      changes: {
        "file:///src/a.ts": [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: "newName",
          },
        ],
      },
    };
    const result = formatWorkspaceEdit(edit);
    expect(result).toContain("1 change(s)");
    expect(result).toContain("newName");
  });
});

describe("formatCodeActions", () => {
  it("formats actions with kinds", () => {
    const actions: CodeAction[] = [
      { title: "Add missing import", kind: "quickfix", isPreferred: true },
      { title: "Extract function", kind: "refactor.extract" },
    ];
    const result = formatCodeActions(actions);
    expect(result).toContain("2");
    expect(result).toContain("Add missing import");
    expect(result).toContain("[quickfix]");
    expect(result).toContain("⭐");
    expect(result).toContain("Extract function");
  });
});
