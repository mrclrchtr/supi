import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { registerToolFamily } from "../../../src/tool/common/register-family.ts";

/**
 * Shared registration helper tests.
 *
 * Verifies that one shared helper can register a tool family from
 * specs without re-declaring metadata for each tool.
 */
describe("register-family", () => {
  it("registers tools from an array of specs", () => {
    const pi = createPiMock();

    registerToolFamily(pi as never, [
      {
        name: "test_tool_one",
        label: "Test Tool One",
        description: "A test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text" as const, text: "done" }],
        }),
      },
      {
        name: "test_tool_two",
        label: "Test Tool Two",
        description: "Another test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text" as const, text: "done" }],
        }),
      },
    ]);

    const tools = getTools(pi);
    expect(tools.find((t) => t.name === "test_tool_one")).toBeDefined();
    expect(tools.find((t) => t.name === "test_tool_two")).toBeDefined();
  });

  it("registers a tool with prompt guidance", () => {
    const pi = createPiMock();

    const promptSurfaces = {
      test_tool: {
        description: "Custom description",
        promptSnippet: "Custom snippet",
        promptGuidelines: "Custom guidelines",
      },
    };

    registerToolFamily(
      pi as never,
      [
        {
          name: "test_tool",
          label: "Test Tool",
          description: "Base description",
          parameters: { type: "object", properties: {} },
          execute: async () => ({
            content: [{ type: "text" as const, text: "done" }],
          }),
        },
      ],
      promptSurfaces,
    );

    const tool = getTool(pi, "test_tool");
    expect(tool).toBeDefined();
    expect((tool as { description?: unknown }).description).toBeDefined();
  });

  it("registers a tool with execute function", async () => {
    const pi = createPiMock();

    registerToolFamily(pi as never, [
      {
        name: "test_execute",
        label: "Test Execute",
        description: "Execute test",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text" as const, text: "executed" }],
        }),
      },
    ]);

    const tool = getTool(pi, "test_execute") as {
      execute?: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
    const result = await (tool.execute as NonNullable<typeof tool.execute>)(
      "call-1",
      {},
      null,
      null,
      null,
    );
    expect(result.content[0].text).toBe("executed");
  });
});
