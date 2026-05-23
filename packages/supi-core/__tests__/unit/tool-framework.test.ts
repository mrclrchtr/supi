import { Type } from "typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CharacterParam,
  derivePromptSurface,
  FileParam,
  LineParam,
  MaxResultsParam,
  registerSuiPiTools,
  type SuiPiToolPromptSurface,
  type SuiPiToolSpec,
  SymbolParam,
  type ToolExecuteFn,
} from "../../src/tool-framework.ts";

function makeSpec(overrides: Partial<SuiPiToolSpec> = {}): SuiPiToolSpec {
  return {
    name: "test_tool",
    label: "Test Tool",
    description: "A test tool for unit testing.",
    promptSnippet: "test_tool — a test tool",
    promptGuidelines: ["Use test_tool for testing."],
    parameters: Type.Object({ value: Type.String() }),
    ...overrides,
  };
}

function makeSurface(overrides: Partial<SuiPiToolPromptSurface> = {}): SuiPiToolPromptSurface {
  return {
    description: "A test tool for unit testing.",
    promptSnippet: "test_tool — a test tool",
    promptGuidelines: ["Use test_tool for testing."],
    ...overrides,
  };
}

describe("derivePromptSurface", () => {
  it("copies description, promptSnippet, and promptGuidelines from the spec", () => {
    const spec = makeSpec();

    const surface = derivePromptSurface(spec);

    expect(surface.description).toBe(spec.description);
    expect(surface.promptSnippet).toBe(spec.promptSnippet);
    expect(surface.promptGuidelines).toEqual(spec.promptGuidelines);
  });

  it("returns a new promptGuidelines array (not a reference to the spec's array)", () => {
    const spec = makeSpec();
    const originalGuidelines = [...spec.promptGuidelines];

    const surface = derivePromptSurface(spec);
    surface.promptGuidelines.push("extra guideline");

    expect(spec.promptGuidelines).toEqual(originalGuidelines);
  });
});

describe("registerSuiPiTools", () => {
  let mockRegisterTool: ReturnType<typeof vi.fn>;
  let mockCreateExecute: ReturnType<typeof vi.fn<(spec: SuiPiToolSpec) => ToolExecuteFn>>;
  let mockPi: { registerTool: typeof mockRegisterTool };

  beforeEach(() => {
    mockRegisterTool = vi.fn();
    mockCreateExecute = vi
      .fn()
      .mockReturnValue(vi.fn().mockResolvedValue({ content: [], details: {} }));
    mockPi = { registerTool: mockRegisterTool };
  });

  it("calls pi.registerTool once per spec", () => {
    const specs = [makeSpec({ name: "tool_a" }), makeSpec({ name: "tool_b" })];
    const surfaces = {
      tool_a: makeSurface(),
      tool_b: makeSurface(),
    };

    registerSuiPiTools(mockPi as never, specs, surfaces, mockCreateExecute);

    expect(mockRegisterTool).toHaveBeenCalledTimes(2);
  });

  it("passes name and label from the spec", () => {
    const spec = makeSpec({ name: "my_tool", label: "My Tool" });
    const surfaces = { my_tool: makeSurface() };

    registerSuiPiTools(mockPi as never, [spec], surfaces, mockCreateExecute);

    const call = mockRegisterTool.mock.calls[0][0];
    expect(call.name).toBe("my_tool");
    expect(call.label).toBe("My Tool");
  });

  it("passes description, promptSnippet, and promptGuidelines from the surface", () => {
    const spec = makeSpec({ name: "my_tool" });
    const surface = makeSurface({
      description: "Custom surface description.",
      promptSnippet: "custom — snippet",
      promptGuidelines: ["Custom guideline 1", "Custom guideline 2"],
    });
    const surfaces = { my_tool: surface };

    registerSuiPiTools(mockPi as never, [spec], surfaces, mockCreateExecute);

    const call = mockRegisterTool.mock.calls[0][0];
    expect(call.description).toBe("Custom surface description.");
    expect(call.promptSnippet).toBe("custom — snippet");
    expect(call.promptGuidelines).toEqual(["Custom guideline 1", "Custom guideline 2"]);
  });

  it("passes parameters from the spec", () => {
    const params = Type.Object({ query: Type.String() });
    const spec = makeSpec({ name: "my_tool", parameters: params });
    const surfaces = { my_tool: makeSurface() };

    registerSuiPiTools(mockPi as never, [spec], surfaces, mockCreateExecute);

    const call = mockRegisterTool.mock.calls[0][0];
    expect(call.parameters).toBe(params);
  });

  it("calls createExecute once per spec with that spec", () => {
    const specA = makeSpec({ name: "tool_a" });
    const specB = makeSpec({ name: "tool_b" });
    const surfaces = {
      tool_a: makeSurface(),
      tool_b: makeSurface(),
    };

    registerSuiPiTools(mockPi as never, [specA, specB], surfaces, mockCreateExecute);

    expect(mockCreateExecute).toHaveBeenCalledTimes(2);
    expect(mockCreateExecute).toHaveBeenNthCalledWith(1, specA);
    expect(mockCreateExecute).toHaveBeenNthCalledWith(2, specB);
  });

  it("passes the execute function returned by createExecute", () => {
    const executeFn = vi.fn();
    mockCreateExecute.mockReturnValue(executeFn);
    const spec = makeSpec({ name: "my_tool" });
    const surfaces = { my_tool: makeSurface() };

    registerSuiPiTools(mockPi as never, [spec], surfaces, mockCreateExecute);

    const call = mockRegisterTool.mock.calls[0][0];
    expect(call.execute).toBe(executeFn);
  });

  it("falls back to spec.description when surface has empty description", () => {
    const spec = makeSpec({ name: "my_tool", description: "Fallback description." });
    const surface = makeSurface({ description: "" });
    const surfaces = { my_tool: surface };

    registerSuiPiTools(mockPi as never, [spec], surfaces, mockCreateExecute);

    const call = mockRegisterTool.mock.calls[0][0];
    expect(call.description).toBe("");
  });
});

describe("shared param builders", () => {
  it("FileParam is a string schema with a description", () => {
    const schema = FileParam as unknown as Record<string, unknown>;
    expect(schema.type).toBe("string");
    expect(schema.description).toBe("File path (relative or absolute)");
  });

  it("LineParam is a number schema with minimum 1", () => {
    const schema = LineParam as unknown as Record<string, unknown>;
    expect(schema.type).toBe("number");
    expect(schema.minimum).toBe(1);
  });

  it("CharacterParam is a number schema with minimum 1", () => {
    const schema = CharacterParam as unknown as Record<string, unknown>;
    expect(schema.type).toBe("number");
    expect(schema.minimum).toBe(1);
  });

  it("SymbolParam is a string schema with a description", () => {
    const schema = SymbolParam as unknown as Record<string, unknown>;
    expect(schema.type).toBe("string");
    expect(schema.description).toBe("Symbol name for discovery-based resolution");
  });

  it("MaxResultsParam is a number schema with a description", () => {
    const schema = MaxResultsParam as unknown as Record<string, unknown>;
    expect(schema.type).toBe("number");
    expect(schema.description).toBe("Maximum results to return");
  });
});
