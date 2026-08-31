// Tree-sitter lifecycle controller — owns one Structural Worker for one cwd.

import { fileURLToPath } from "node:url";
import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createTreeSitterProvider } from "../provider/tree-sitter-provider.ts";
import type { TreeSitterService, TreeSitterSession } from "../types.ts";
import { createTreeSitterSession } from "./session.ts";

/** Starting state before or after shutdown. */
type TsControllerState = TsControllerInitial | TsControllerReady | TsControllerUnavailable;

interface TsControllerInitial {
  kind: "initial";
}

interface TsControllerReady {
  kind: "ready";
  session: TreeSitterSession;
  service: TreeSitterService;
}

interface TsControllerUnavailable {
  kind: "unavailable";
  reason: string;
}

/** Result type from {@link TreeSitterRuntimeController.start}. */
type TsStartResult = { kind: "ready" } | { kind: "unavailable"; reason: string };

/** Pi-independent lifecycle for one shared workspace Structural Worker. */
export class TreeSitterRuntimeController {
  readonly #cwd: string;
  #state: TsControllerState = { kind: "initial" };
  readonly #runtime: WorkspaceRuntime;
  #pendingSession: TreeSitterSession | null = null;
  #generation = 0;
  #transition = Promise.resolve();

  constructor(cwd: string, runtime: WorkspaceRuntime) {
    this.#cwd = cwd;
    this.#runtime = runtime;
  }

  get cwd(): string {
    return this.#cwd;
  }

  get kind(): TsControllerState["kind"] {
    return this.#state.kind;
  }

  get service(): TreeSitterService | null {
    return this.#state.kind === "ready" ? this.#state.service : null;
  }

  /** Start and validate one Structural Worker before capability publication. */
  start(): Promise<TsStartResult> {
    const generation = ++this.#generation;
    let result: TsStartResult = supersededStart();
    const transition = this.#transition.then(async () => {
      if (generation !== this.#generation) return;
      result = await this.#startGeneration(generation);
    });
    this.#transition = transition.catch(() => undefined);
    return transition.then(() => result);
  }

  /** Stop publication, terminate owned Workers, and await their exit. */
  async shutdown(): Promise<void> {
    const generation = ++this.#generation;
    const sessions = this.#takeOwnedSessions();
    await Promise.all([...sessions].map((session) => session.dispose()));
    if (generation === this.#generation) this.#state = { kind: "initial" };
  }

  async #startGeneration(generation: number): Promise<TsStartResult> {
    const previous = this.#takeOwnedSessions();
    await Promise.all([...previous].map((session) => session.dispose()));
    if (generation !== this.#generation) return supersededStart();
    this.#state = { kind: "unavailable", reason: "Initializing Tree-sitter" };

    const session = createTreeSitterSession(this.#cwd);
    this.#pendingSession = session;
    try {
      const probe = await session.canParse(fileURLToPath(import.meta.url));
      if (probe.kind !== "success") throw new Error(probe.message);
      if (generation !== this.#generation || this.#pendingSession !== session) {
        return supersededStart();
      }
      this.#runtime.registerStructural(this.#cwd, createTreeSitterProvider(session));
      this.#pendingSession = null;
      this.#state = { kind: "ready", session, service: session };
      return { kind: "ready" };
    } catch (error) {
      if (generation !== this.#generation || this.#pendingSession !== session) {
        return supersededStart();
      }
      await session.dispose();
      this.#pendingSession = null;
      const reason = error instanceof Error ? error.message : String(error);
      await this.#clearPublishedSession();
      this.#state = { kind: "unavailable", reason };
      return { kind: "unavailable", reason };
    }
  }

  async #clearPublishedSession(): Promise<void> {
    const sessions = this.#takeOwnedSessions();
    await Promise.all([...sessions].map((session) => session.dispose()));
  }

  #takeOwnedSessions(): Set<TreeSitterSession> {
    this.#runtime.clearStructural(this.#cwd);
    const sessions = new Set<TreeSitterSession>();
    if (this.#pendingSession) sessions.add(this.#pendingSession);
    if (this.#state.kind === "ready") sessions.add(this.#state.session);
    this.#pendingSession = null;
    this.#state = { kind: "initial" };
    return sessions;
  }
}

function supersededStart(): TsStartResult {
  return { kind: "unavailable", reason: "Startup superseded" };
}
