import { describe, expect, it } from "vitest";
import { LSP_LOOKUP_TOOL, LSP_TOOL_NAMES } from "../../src/tool/names.ts";
import {
  getSupportedLspServerActions,
  LSP_TOOL_DEFINITION_SPECS,
} from "../../src/tool/tool-specs.ts";

describe("LSP tool specs", () => {
  it("defines one registration spec for every public LSP tool", () => {
    expect(LSP_TOOL_DEFINITION_SPECS.map((spec) => spec.name)).toEqual([...LSP_TOOL_NAMES]);
    expect(
      LSP_TOOL_DEFINITION_SPECS.some(
        (spec) =>
          spec.name === LSP_LOOKUP_TOOL &&
          "includeCoverageGuidelines" in spec &&
          spec.includeCoverageGuidelines,
      ),
    ).toBe(true);
  });

  it("derives supported server actions from capabilities", () => {
    const actions = getSupportedLspServerActions({
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: false,
      implementationProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      renameProvider: true,
      codeActionProvider: { codeActionKinds: ["quickfix"] },
    });

    expect(actions).toEqual([
      "diagnostics [optional file]",
      "hover(file,line,char)",
      "definition(file,line,char)",
      "implementation(file,line,char)",
      "symbols(file)",
      "workspace_symbols(query)",
      "rename(file,line,char,newName)",
      "code_actions(file,line,char)",
    ]);
  });
});
