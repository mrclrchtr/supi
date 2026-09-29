import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { registerWorkspaceRecoveryHandler } from "../../../../src/substrate/lsp/recovery.ts";
import { createLspAdapterState } from "../../../../src/substrate/lsp/state.ts";

describe("workspace LSP recovery", () => {
  it("notifies the runtime about every successfully applied refactor file", async () => {
    const pi = createPiMock();
    const noteWorkspaceWrites = vi.fn();
    const state = createLspAdapterState();
    state.controller = {
      cwd: "/workspace",
      workspaceRuntime: { noteWorkspaceWrites },
    } as never;
    registerWorkspaceRecoveryHandler(pi as never, state);

    const handler = getHandlerOrThrow(pi, "tool_result");
    await handler(
      {
        toolName: "code_refactor_apply",
        isError: false,
        details: {
          type: "search",
          data: {
            confidence: "semantic",
            changedFiles: ["/workspace/src/a.ts", "/workspace/src/b.ts", "/workspace/src/a.ts"],
          },
        },
      },
      makeCtx({ cwd: "/workspace" }),
    );

    expect(noteWorkspaceWrites).toHaveBeenCalledTimes(2);
    expect(noteWorkspaceWrites).toHaveBeenNthCalledWith(1, [
      { uri: "file:///workspace/src/a.ts", type: 2 },
    ]);
    expect(noteWorkspaceWrites).toHaveBeenNthCalledWith(2, [
      { uri: "file:///workspace/src/b.ts", type: 2 },
    ]);
  });
});
