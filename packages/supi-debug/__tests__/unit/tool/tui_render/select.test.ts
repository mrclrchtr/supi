import { describe, expect, it } from "vitest";
import { selectToolResult } from "../../../../src/tool/tui_render/select.ts";

function call(id: string, name: string, args: Record<string, unknown>) {
  return {
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
  };
}

function result(id: string, name: string, text: string, isError = false) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: [{ type: "text", text }],
      details: { text },
      isError,
      durationMs: 7,
    },
  };
}

const branch = [
  call("c1", "code_health", { scope: "a" }),
  result("c1", "code_health", "first"),
  call("c2", "read", { path: "x" }),
  result("c2", "read", "file", true),
  call("c3", "code_health", { scope: "b" }),
  result("c3", "code_health", "second"),
];

describe("selectToolResult", () => {
  it("selects the latest result for a tool name by default and joins its call arguments", () => {
    const selected = selectToolResult(branch, { tool: { name: "code_health" } });

    expect(selected).toMatchObject({
      kind: "selected",
      index: 0,
      matchCount: 2,
      toolName: "code_health",
      toolCallId: "c3",
      args: { scope: "b" },
      result: { content: [{ type: "text", text: "second" }], details: { text: "second" } },
      isError: false,
      durationMs: 7,
    });
  });

  it("counts index back from the latest result", () => {
    const selected = selectToolResult(branch, { tool: { name: "code_health", index: 1 } });

    expect(selected).toMatchObject({ kind: "selected", toolCallId: "c1", args: { scope: "a" } });
  });

  it("selects by tool call id and keeps the error flag", () => {
    const selected = selectToolResult(branch, { toolCallId: "c2" });

    expect(selected).toMatchObject({
      kind: "selected",
      toolName: "read",
      args: { path: "x" },
      isError: true,
    });
  });

  it("reports the tool names on the branch when no result matches", () => {
    const selected = selectToolResult(branch, { tool: { name: "web_search" } });

    expect(selected).toEqual({
      kind: "not-found",
      message:
        'No "web_search" result on the current session branch. Tool results on this branch: code_health (2), read (1).',
    });
  });

  it("reports the available range when the index is too large", () => {
    const selected = selectToolResult(branch, { tool: { name: "code_health", index: 2 } });

    expect(selected).toEqual({
      kind: "not-found",
      message:
        'Index 2 is out of range: the current session branch has 2 "code_health" results (index 0 is the latest).',
    });
  });

  it("reports an unknown tool call id", () => {
    expect(selectToolResult(branch, { toolCallId: "nope" })).toEqual({
      kind: "not-found",
      message: 'No tool result with toolCallId "nope" on the current session branch.',
    });
  });

  it("points to the parent row for a tool that only ran inside another tool", () => {
    const parent = result("p1", "codemode", "script");
    parent.message = {
      ...parent.message,
      nestedCalls: {
        complete: true,
        calls: [
          { id: "p1/1", name: "web_search", status: "ok" },
          { id: "p1/2", name: "web_search", status: "ok" },
        ],
      },
    } as typeof parent.message;
    const nestedBranch = [...branch, parent];

    expect(selectToolResult(nestedBranch, { tool: { name: "web_search" } })).toEqual({
      kind: "not-found",
      message:
        '"web_search" ran 2 times only inside other tools. Pi stores no results for nested calls; render the parent row instead: target { toolCallId: "p1" } (codemode). Tool results on this branch: code_health (2), codemode (1), read (1).',
    });
    expect(selectToolResult(nestedBranch, { toolCallId: "p1/2" })).toEqual({
      kind: "not-found",
      message:
        '"p1/2" is a nested web_search call. Pi stores no results for nested calls; render the parent row instead: target { toolCallId: "p1" } (codemode).',
    });
  });

  it("falls back to empty arguments when the call is not on the branch", () => {
    const selected = selectToolResult([result("c9", "bash", "out")], { toolCallId: "c9" });

    expect(selected).toMatchObject({ kind: "selected", args: {} });
  });
});
