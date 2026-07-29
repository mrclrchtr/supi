import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lsp: [] as Array<{ start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }>,
  tree: [] as Array<{ start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }>,
}));
vi.mock("@mrclrchtr/supi-lsp/api", () => ({
  LspRuntimeController: class {
    start = vi.fn(async () => ({ kind: "ready" as const }));
    shutdown = vi.fn(async () => {});
    constructor() {
      mocks.lsp.push(this);
    }
  },
  scanWorkspaceSentinels: vi.fn(() => new Map()),
}));
vi.mock("@mrclrchtr/supi-tree-sitter/api", () => ({
  TreeSitterRuntimeController: class {
    start = vi.fn(async () => ({ kind: "ready" as const }));
    shutdown = vi.fn(async () => {});
    constructor() {
      mocks.tree.push(this);
    }
  },
}));

import {
  acquireWorkspaceProviderHost,
  resetWorkspaceProviderHostsForTests,
} from "../../../src/substrate/workspace-provider-host.ts";

describe("Workspace provider host", () => {
  afterEach(() => {
    mocks.lsp.length = 0;
    mocks.tree.length = 0;
    resetWorkspaceProviderHostsForTests();
  });

  it("does not expose a trusted LSP controller to an untrusted lease", async () => {
    const trusted = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });
    const untrusted = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: false });

    expect(trusted.lspController).not.toBeNull();
    expect(untrusted.lspController).toBeNull();

    await trusted.release();
    await untrusted.release();
  });

  it("shares providers until the final lease releases them", async () => {
    const first = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });
    const second = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });

    expect(mocks.lsp).toHaveLength(1);
    expect(mocks.tree).toHaveLength(1);
    expect(mocks.lsp[0]?.start).toHaveBeenCalledOnce();
    expect(mocks.tree[0]?.start).toHaveBeenCalledOnce();

    await first.release();
    expect(mocks.lsp[0]?.shutdown).not.toHaveBeenCalled();
    await second.release();
    expect(mocks.lsp[0]?.shutdown).toHaveBeenCalledOnce();
    expect(mocks.tree[0]?.shutdown).toHaveBeenCalledOnce();
  });
});
