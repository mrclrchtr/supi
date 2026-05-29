import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { registerCiStatusCommand } from "../../src/ui/code-intelligence-status-command.ts";

describe("/ci-status command", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
  });

  it("reports only the active code_* tool surface", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_graph", "code_health", "lsp_hover", "tree_sitter_outline"]);

    const ctx = makeCtx({ cwd: "/project" });
    const cmd = pi.getCommandHandler("ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
    const notifyMock = ctx.ui.notify as unknown as {
      mock: { calls: Array<[string, string]> };
    };
    const [message, level] = notifyMock.mock.calls[0] ?? ["", ""];

    expect(level).toBe("info");
    expect(message).toContain("**Active tools:**");
    expect(message).toContain("code_graph");
    expect(message).toContain("code_health");
    expect(message).not.toContain("lsp_hover");
    expect(message).not.toContain("tree_sitter_outline");
  });
});
