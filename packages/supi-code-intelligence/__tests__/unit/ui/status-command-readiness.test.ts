import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCiStatusCommand } from "../../../src/ui/status-command.ts";

const mocks = vi.hoisted(() => ({ getWorkspaceLspRuntime: vi.fn() }));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getWorkspaceLspRuntime: mocks.getWorkspaceLspRuntime };
});

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
  vi.clearAllMocks();
});

function registerSemantic(cwd: string): void {
  getDefaultWorkspaceRuntime().registerSemantic(cwd, {
    references: async () => [],
    implementation: async () => [],
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
  });
}

async function renderStatusOverlay(): Promise<string> {
  const pi = createPiMock();
  registerCiStatusCommand(pi as never);
  const ctx = makeCtx({ cwd: "/project" });
  Object.assign(ctx.ui, { setFooter: vi.fn() });
  const command = pi.getCommandHandler("supi-ci-status") as (
    args: string,
    context: ReturnType<typeof makeCtx>,
  ) => Promise<void>;

  await command("", ctx);
  const custom = ctx.ui.custom as unknown as {
    mock: { calls: Array<[(tui: unknown, theme: unknown, kb: unknown, done: unknown) => unknown]> };
  };
  const factory = custom.mock.calls[0]?.[0];
  const dialog = factory?.({ requestRender: vi.fn() }, ctx.ui.theme, undefined, vi.fn()) as {
    render(width: number): string[];
  };
  return dialog.render(80).join("\n");
}

describe("/supi-ci-status readiness evidence", () => {
  it("reports explicit disabled inventory even when no composite provider exists", async () => {
    mocks.getWorkspaceLspRuntime.mockReturnValue({ kind: "disabled" });

    const rendered = await renderStatusOverlay();

    expect(rendered).toContain("all language servers disabled");
    expect(rendered).toContain("disabled");
    expect(rendered).not.toContain("no LSP session for this workspace");
  });

  it("does not claim diagnostic absence for a ready owner with no active-ready server", async () => {
    registerSemantic("/project");
    const getOutstandingDiagnosticSummary = vi.fn(() => []);
    const runtime = {
      getProjectServers: vi.fn(() => []),
      getOutstandingDiagnosticSummary,
      getOutstandingDiagnostics: vi.fn(() => []),
    } as unknown as WorkspaceLspRuntime;
    mocks.getWorkspaceLspRuntime.mockReturnValue({ kind: "ready", runtime });

    const rendered = await renderStatusOverlay();

    expect(getOutstandingDiagnosticSummary).not.toHaveBeenCalled();
    expect(rendered).toContain("routes may start lazily");
    expect(rendered).toContain("diagnostics unavailable");
    expect(rendered).not.toContain("✓ no issues");
  });
});
