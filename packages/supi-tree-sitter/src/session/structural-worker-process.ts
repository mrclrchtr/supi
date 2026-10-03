import { type ChildProcess, fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import type {
  ParentToStructuralWorkerMessage,
  StructuralWorkerToParentMessage,
} from "./structural-worker-protocol.ts";

const PARENT_CHANNEL = "supi-tree-sitter-parent";
const WORKER_CHANNEL = "supi-tree-sitter-worker";

export interface StructuralWorkerLike {
  postMessage(message: ParentToStructuralWorkerMessage): void;
  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  terminate(): Promise<number>;
}

/** Start the Structural Worker in a Node process with safe WebAssembly compilation. */
export function createStructuralWorkerProcess(options: {
  readonly cwd: string;
  readonly generation: number;
}): StructuralWorkerLike {
  const hostPath = fileURLToPath(new URL("../worker/process-host.mjs", import.meta.url));
  // A child process accepts the V8 flag that a Worker thread rejects.
  const child = fork(hostPath, [options.cwd, String(options.generation)], {
    execArgv: ["--liftoff-only"],
    env: { ...process.env, NODE_OPTIONS: "" },
    serialization: "advanced",
    stdio: ["ignore", "ignore", "inherit", "ipc"],
    windowsHide: true,
  });
  return new StructuralWorkerProcess(child);
}

class StructuralWorkerProcess implements StructuralWorkerLike {
  readonly #events = new EventEmitter();
  readonly #child: ChildProcess;

  constructor(child: ChildProcess) {
    this.#child = child;
    child.on("message", (value: unknown) => this.#receive(value));
    child.on("error", (error) => this.#events.emit("error", error));
    child.on("exit", (code) => this.#events.emit("exit", code ?? 1));
  }

  postMessage(message: ParentToStructuralWorkerMessage): void {
    if (!this.#child.connected) throw new Error("Structural Worker process is disconnected");
    // The process host creates a shared cancellation flag for its Worker thread.
    const forwarded =
      message.kind === "request" ? { ...message, cancellationFlag: undefined } : message;
    this.#child.send({ channel: PARENT_CHANNEL, message: forwarded }, (error) => {
      if (error) this.#events.emit("error", error);
    });
  }

  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  on(
    event: "message" | "error" | "exit",
    listener: ((message: unknown) => void) | ((error: Error) => void) | ((code: number) => void),
  ): this {
    this.#events.on(event, listener);
    return this;
  }

  terminate(): Promise<number> {
    if (this.#child.exitCode !== null) return Promise.resolve(this.#child.exitCode ?? 0);
    if (this.#child.signalCode !== null) return Promise.resolve(0);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(forceStopTimer);
        resolve(code ?? 0);
      };
      const forceStopTimer = setTimeout(() => {
        if (!this.#child.kill("SIGKILL")) finish(this.#child.exitCode);
      }, 250);
      forceStopTimer.unref?.();
      this.#child.once("exit", (code) => finish(code));
      if (!this.#child.kill("SIGTERM")) finish(this.#child.exitCode);
    });
  }

  #receive(value: unknown): void {
    if (!isWorkerChannel(value)) {
      this.#events.emit("message", value);
      return;
    }
    if (value.message.kind === "worker-error") {
      this.#events.emit("error", new Error(value.message.message));
      return;
    }
    this.#events.emit("message", value.message);
  }
}

interface WorkerChannelMessage {
  readonly channel: typeof WORKER_CHANNEL;
  readonly message:
    | StructuralWorkerToParentMessage
    | { readonly kind: "worker-error"; readonly message: string };
}

function isWorkerChannel(value: unknown): value is WorkerChannelMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkerChannelMessage>;
  if (
    candidate.channel !== WORKER_CHANNEL ||
    !candidate.message ||
    typeof candidate.message !== "object"
  ) {
    return false;
  }
  const message = candidate.message as { kind?: unknown; message?: unknown };
  return message.kind !== "worker-error" || typeof message.message === "string";
}
