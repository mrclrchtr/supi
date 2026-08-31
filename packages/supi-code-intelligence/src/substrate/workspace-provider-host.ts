import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { TreeSitterRuntimeController } from "@mrclrchtr/supi-tree-sitter/api";

const HOSTS = Symbol.for("supi-code-intelligence/workspace-provider-hosts");
const CLOSING_HOSTS = Symbol.for("supi-code-intelligence/closing-workspace-provider-hosts");
const SHUTDOWN_GRACE_MS = 2_000;

type HostRegistry = Map<string, WorkspaceProviderHost>;
type ClosingHostRegistry = Map<string, Promise<void>>;

/** One acquired reference to a process-shared Workspace provider host. */
export interface WorkspaceProviderHostLease {
  cwd: string;
  lspController: LspRuntimeController | null;
  sentinelSnapshot: Map<string, number>;
  release(): Promise<void>;
}

function registry(): HostRegistry {
  const global = globalThis as typeof globalThis & { [HOSTS]?: HostRegistry };
  global[HOSTS] ??= new Map();
  return global[HOSTS];
}

function closingRegistry(): ClosingHostRegistry {
  const global = globalThis as typeof globalThis & { [CLOSING_HOSTS]?: ClosingHostRegistry };
  global[CLOSING_HOSTS] ??= new Map();
  return global[CLOSING_HOSTS];
}

function canonicalWorkspace(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return resolve(cwd);
  }
}

function settleWithin(operation: Promise<void>): Promise<void> {
  return Promise.race([
    operation.catch(() => undefined),
    new Promise<void>((resolveGrace) => {
      const timeout = setTimeout(resolveGrace, SHUTDOWN_GRACE_MS);
      timeout.unref?.();
    }),
  ]);
}

class WorkspaceProviderHost {
  readonly cwd: string;
  #leases = 0;
  #lsp: LspRuntimeController | null = null;
  #tree: TreeSitterRuntimeController | null = null;
  #treeStarted = false;
  #lspStarted = false;
  #settledStart = Promise.resolve();
  #closed = false;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async acquire(projectTrusted: boolean): Promise<WorkspaceProviderHostLease> {
    if (this.#closed) throw new Error("Workspace provider host is closed.");
    // Count this pending acquirer before awaiting startup so the final active lease cannot shut it down.
    this.#leases++;
    this.#settledStart = this.#settledStart
      .then(() => this.#startMissing(projectTrusted))
      .catch(() => undefined);
    await this.#settledStart;
    let released = false;
    return {
      cwd: this.cwd,
      lspController: projectTrusted ? this.#lsp : null,
      sentinelSnapshot:
        projectTrusted && this.#lsp?.kind === "ready"
          ? (this.#lsp.workspaceRuntime?.scanWorkspaceSentinels() ?? new Map())
          : new Map(),
      release: async () => {
        if (released) return;
        released = true;
        this.#leases--;
        if (this.#leases === 0) {
          await Promise.resolve();
          if (this.#leases !== 0) return;
          const shutdown = this.#shutdown();
          closingRegistry().set(this.cwd, shutdown);
          try {
            await shutdown;
          } finally {
            if (closingRegistry().get(this.cwd) === shutdown) closingRegistry().delete(this.cwd);
            registry().delete(this.cwd);
          }
        }
      },
    };
  }

  async #startMissing(projectTrusted: boolean): Promise<void> {
    const runtime = getDefaultWorkspaceRuntime();
    if (!this.#treeStarted) {
      this.#treeStarted = true;
      this.#tree = new TreeSitterRuntimeController(this.cwd, runtime);
      await this.#tree.start().catch(() => undefined);
    }
    if (!projectTrusted || this.#lspStarted) return;
    this.#lspStarted = true;
    this.#lsp = new LspRuntimeController(this.cwd, runtime);
    await this.#lsp.start().catch(() => undefined);
  }

  async #shutdown(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.all([
      ...(this.#lsp ? [settleWithin(this.#lsp.shutdown())] : []),
      ...(this.#tree ? [this.#tree.shutdown()] : []),
    ]);
    this.#lsp = null;
    this.#tree = null;
  }
}

/** Acquire shared semantic and structural providers for one canonical workspace. */
export async function acquireWorkspaceProviderHost(
  cwd: string,
  options: { projectTrusted: boolean },
): Promise<WorkspaceProviderHostLease> {
  const workspace = canonicalWorkspace(cwd);
  for (;;) {
    const closing = closingRegistry().get(workspace);
    if (!closing) break;
    await closing.catch(() => undefined);
  }
  const hosts = registry();
  let host = hosts.get(workspace);
  if (!host) {
    host = new WorkspaceProviderHost(workspace);
    hosts.set(workspace, host);
  }
  return host.acquire(options.projectTrusted);
}

/** Clear process-shared hosts between isolated tests. */
export function resetWorkspaceProviderHostsForTests(): void {
  registry().clear();
  closingRegistry().clear();
}
