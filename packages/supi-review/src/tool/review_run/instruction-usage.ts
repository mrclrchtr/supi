import { isAbsolute, relative, resolve } from "node:path";

/**
 * Counts of how a Reviewer reached the package instruction files its packet indexes. Engine-
 * observed tool events only; the Reviewer's own claims are not counted.
 */
export interface InstructionFileUsage {
  /** Package instruction files the packet indexed. */
  indexed: number;
  /** Indexed files a top-level `code_orientation` result delivered. */
  deliveredByOrientation: number;
  /** Indexed files a top-level `read` returned in full. */
  readInFull: number;
  /** Indexed files whose path appeared in a top-level `bash` command (heuristic). */
  mentionedInBash: number;
  /** Indexed files reached by any of the three routes. */
  reached: number;
}

interface ToolStart {
  toolName: string;
  args: unknown;
}

type ObservedEvent =
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Collect per-route counts for indexed instruction files from Reviewer Session events. */
export class InstructionFileUsageObserver {
  readonly #indexed: ReadonlySet<string>;
  readonly #cwd: string;
  readonly #starts = new Map<string, ToolStart>();
  readonly #orientation = new Set<string>();
  readonly #read = new Set<string>();
  readonly #bash = new Set<string>();

  /** `indexedPaths` are workspace-relative POSIX paths; `cwd` is the Review Workspace. */
  constructor(indexedPaths: readonly string[], cwd: string) {
    this.#indexed = new Set(indexedPaths);
    this.#cwd = cwd;
  }

  /** Feed one Reviewer Session event. */
  observe(event: ObservedEvent): void {
    if (event.type === "tool_execution_start" && "args" in event) {
      this.#starts.set(event.toolCallId, { toolName: event.toolName, args: event.args });
      return;
    }
    if (event.type !== "tool_execution_end" || !("result" in event)) return;
    const start = this.#starts.get(event.toolCallId);
    this.#starts.delete(event.toolCallId);
    if (!start || event.isError) return;
    const args = record(start.args);
    if (start.toolName === "read") this.#recordRead(args, event.result);
    else if (start.toolName === "bash") this.#recordBash(args);
    else if (start.toolName === "code_orientation") this.#recordOrientation(event.result);
  }

  /** Current counts. */
  snapshot(): InstructionFileUsage {
    const reached = new Set([...this.#orientation, ...this.#read, ...this.#bash]);
    return {
      indexed: this.#indexed.size,
      deliveredByOrientation: this.#orientation.size,
      readInFull: this.#read.size,
      mentionedInBash: this.#bash.size,
      reached: reached.size,
    };
  }

  #workspacePath(path: string): string | undefined {
    const absolute = resolve(this.#cwd, path.replace(/^@/, ""));
    const relativePath = relative(this.#cwd, absolute);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
    return relativePath.split("\\").join("/");
  }

  #recordRead(args: Record<string, unknown> | undefined, result: unknown): void {
    if (typeof args?.path !== "string" || args.offset !== undefined || args.limit !== undefined) {
      return;
    }
    const truncation = record(record(record(result)?.details)?.truncation);
    if (truncation?.truncated === true) return;
    const path = this.#workspacePath(args.path);
    if (path && this.#indexed.has(path)) this.#read.add(path);
  }

  #recordBash(args: Record<string, unknown> | undefined): void {
    const command = args?.command;
    if (typeof command !== "string") return;
    for (const path of this.#indexed) if (command.includes(path)) this.#bash.add(path);
  }

  #recordOrientation(result: unknown): void {
    const details = record(record(result)?.details);
    const files = record(record(details?.data)?.instructions)?.files;
    if (!Array.isArray(files)) return;
    for (const file of files) {
      const path = record(file)?.path;
      if (typeof path === "string" && this.#indexed.has(path)) this.#orientation.add(path);
    }
  }
}
