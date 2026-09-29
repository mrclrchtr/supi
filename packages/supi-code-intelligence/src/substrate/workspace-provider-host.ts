import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  type AutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
  LspRuntimeController,
} from "@mrclrchtr/supi-lsp/api";
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
  /** Immutable automatic exclusion policy captured for this lease. */
  automaticPathPolicy: AutomaticLspPathPolicy;
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

function canonicalPath(candidate: string): string {
  try {
    return realpathSync(candidate);
  } catch {
    return resolve(candidate);
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
  #automaticPathPolicies = new Map<boolean, AutomaticLspPathPolicy>();
  /** One configuration home owns all providers and policies until shutdown. */
  #homeDir: string | null = null;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async acquire(projectTrusted: boolean, homeDir?: string): Promise<WorkspaceProviderHostLease> {
    if (this.#closed) throw new Error("Workspace provider host is closed.");
    const normalizedHome = canonicalPath(homeDir ?? homedir());
    if (this.#homeDir !== null && this.#homeDir !== normalizedHome) {
      throw new Error(
        `Workspace ${this.cwd} already uses configuration home ${this.#homeDir}. Cannot use ${normalizedHome} until all existing provider leases are released.`,
      );
    }
    const automaticPathPolicy =
      this.#automaticPathPolicies.get(projectTrusted) ??
      createDefaultAutomaticLspPathPolicy(this.cwd, {
        projectTrusted,
        homeDir: normalizedHome,
      });
    this.#homeDir = normalizedHome;
    this.#automaticPathPolicies.set(projectTrusted, automaticPathPolicy);
    // Count this pending acquirer before awaiting startup so the final active lease cannot shut it down.
    this.#leases++;
    this.#settledStart = this.#settledStart
      .then(() => this.#startMissing(projectTrusted, automaticPathPolicy, normalizedHome))
      .catch(() => undefined);
    await this.#settledStart;
    let released = false;
    return {
      cwd: this.cwd,
      lspController: projectTrusted ? this.#lsp : null,
      automaticPathPolicy,
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

  async #startMissing(
    projectTrusted: boolean,
    automaticPathPolicy: AutomaticLspPathPolicy,
    homeDir?: string,
  ): Promise<void> {
    const runtime = getDefaultWorkspaceRuntime();
    if (!this.#treeStarted) {
      this.#treeStarted = true;
      this.#tree = new TreeSitterRuntimeController(this.cwd, runtime);
      await this.#tree.start().catch(() => undefined);
    }
    if (!projectTrusted || this.#lspStarted) return;
    this.#lspStarted = true;
    this.#lsp = new LspRuntimeController(this.cwd, runtime, {
      automaticPathPolicy,
      projectTrusted,
      homeDir,
    });
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
    this.#automaticPathPolicies.clear();
  }
}

/**
 * Acquire shared providers for one canonical workspace and configuration home.
 * A different home is rejected until all existing leases are released.
 * An omitted home uses the operating system's default home directory.
 */
export async function acquireWorkspaceProviderHost(
  cwd: string,
  options: { projectTrusted: boolean; homeDir?: string },
): Promise<WorkspaceProviderHostLease> {
  const workspace = canonicalPath(cwd);
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
  return host.acquire(options.projectTrusted, options.homeDir);
}

/** Clear process-shared hosts between isolated tests. */
export function resetWorkspaceProviderHostsForTests(): void {
  registry().clear();
  closingRegistry().clear();
}
