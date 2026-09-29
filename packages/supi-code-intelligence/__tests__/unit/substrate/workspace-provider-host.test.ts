import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createDefaultAutomaticLspPathPolicy } from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lsp: [] as Array<{ start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }>,
  tree: [] as Array<{ start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }>,
}));
vi.mock("@mrclrchtr/supi-lsp/api", () => ({
  createDefaultAutomaticLspPathPolicy: vi.fn(() => ({
    workspaceRoot: "/workspace",
    isEligible: () => true,
  })),
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
  const temporaryDirectories: string[] = [];

  function createHome(): string {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "supi-provider-home-")));
    temporaryDirectories.push(directory);
    return directory;
  }

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
    vi.clearAllMocks();
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

  it("shares the default home with an explicit default home", async () => {
    const first = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });
    const second = await acquireWorkspaceProviderHost("/workspace", {
      projectTrusted: true,
      homeDir: homedir(),
    });

    expect(second.automaticPathPolicy).toBe(first.automaticPathPolicy);
    expect(mocks.lsp).toHaveLength(1);
    await first.release();
    await second.release();
  });

  it("shares relative and symbolic-link paths to the same home", async () => {
    const homeDir = createHome();
    const link = join(createHome(), "home-link");
    symlinkSync(homeDir, link, "dir");
    const first = await acquireWorkspaceProviderHost("/workspace", {
      projectTrusted: true,
      homeDir: relative(process.cwd(), homeDir),
    });
    const second = await acquireWorkspaceProviderHost("/workspace", {
      projectTrusted: true,
      homeDir: link,
    });

    expect(second.automaticPathPolicy).toBe(first.automaticPathPolicy);
    expect(createDefaultAutomaticLspPathPolicy).toHaveBeenCalledExactlyOnceWith("/workspace", {
      projectTrusted: true,
      homeDir,
    });
    await first.release();
    await second.release();
  });

  it.each([true, false])(
    "rejects a different home for trust=%s without acquiring a lease",
    async (projectTrusted) => {
      const homeDir = createHome();
      const otherHome = createHome();
      const first = await acquireWorkspaceProviderHost("/workspace", {
        projectTrusted: false,
        homeDir,
      });

      await expect(
        acquireWorkspaceProviderHost("/workspace", { projectTrusted, homeDir: otherHome }),
      ).rejects.toThrow("already uses configuration home");
      expect(createDefaultAutomaticLspPathPolicy).toHaveBeenCalledOnce();
      expect(mocks.lsp).toHaveLength(0);
      expect(mocks.tree).toHaveLength(1);
      await first.release();
      expect(mocks.tree[0]?.shutdown).toHaveBeenCalledOnce();

      const next = await acquireWorkspaceProviderHost("/workspace", {
        projectTrusted: true,
        homeDir: otherHome,
      });
      expect(createDefaultAutomaticLspPathPolicy).toHaveBeenLastCalledWith("/workspace", {
        projectTrusted: true,
        homeDir: otherHome,
      });
      expect(mocks.lsp).toHaveLength(1);
      await next.release();
    },
  );

  it("rejects a conflicting home while the first acquisition is pending", async () => {
    const first = acquireWorkspaceProviderHost("/workspace", {
      projectTrusted: true,
      homeDir: createHome(),
    });
    await expect(
      acquireWorkspaceProviderHost("/workspace", {
        projectTrusted: true,
        homeDir: createHome(),
      }),
    ).rejects.toThrow("already uses configuration home");
    await (await first).release();
    expect(mocks.lsp).toHaveLength(1);
    expect(mocks.lsp[0]?.shutdown).toHaveBeenCalledOnce();
  });

  it("does not bind a home when policy validation fails", async () => {
    vi.mocked(createDefaultAutomaticLspPathPolicy).mockImplementationOnce(() => {
      throw new Error("Invalid exclusion configuration");
    });
    await expect(
      acquireWorkspaceProviderHost("/workspace", {
        projectTrusted: true,
        homeDir: createHome(),
      }),
    ).rejects.toThrow("Invalid exclusion configuration");
    expect(mocks.tree).toHaveLength(0);
    const next = await acquireWorkspaceProviderHost("/workspace", {
      projectTrusted: true,
      homeDir: createHome(),
    });
    await next.release();
    expect(mocks.lsp[0]?.shutdown).toHaveBeenCalledOnce();
  });

  it("keeps a pending acquirer alive while the prior lease releases", async () => {
    const first = await acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });
    const pending = acquireWorkspaceProviderHost("/workspace", { projectTrusted: true });

    await first.release();
    const second = await pending;

    expect(second.lspController).not.toBeNull();
    expect(mocks.lsp[0]?.shutdown).not.toHaveBeenCalled();
    await second.release();
    expect(mocks.lsp[0]?.shutdown).toHaveBeenCalledOnce();
  });
});
