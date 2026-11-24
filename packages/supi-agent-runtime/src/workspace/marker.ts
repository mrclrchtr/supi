import { randomUUID } from "node:crypto";
import type { AgentWorkspaceOwner, AgentWorkspaceOwnerStatus } from "./types.ts";

/** Prefix of every lock reason SuPi writes. */
export const AGENT_WORKSPACE_MARKER_PREFIX = "supi-agent:";
/** Prefix written by Review before Agent Workspaces existed; still recognized for cleanup. */
export const LEGACY_REVIEW_MARKER_PREFIX = "supi-review:";

/** Parsed SuPi lock reason. */
export interface ParsedAgentWorkspaceMarker {
  /** Owner named by the marker; legacy markers are `review`; undefined when unreadable. */
  owner?: string;
  /** True for a legacy `supi-review:` marker. */
  legacy: boolean;
  pid?: number;
  /** True when the marker was written for a disposable workspace (and for legacy markers). */
  disposable: boolean;
}

/**
 * Build a fresh lock reason `supi-agent:<owner>:<uuid>;pid=<pid>;started=<iso>`, followed by
 * `;disposable` for a disposable workspace. Recording disposability at creation time keeps it
 * independent of the temporary directory of a later cleanup process.
 */
export function createAgentWorkspaceMarker(
  owner: AgentWorkspaceOwner,
  options: { disposable?: boolean } = {},
): string {
  const suffix = options.disposable ? ";disposable" : "";
  return `${AGENT_WORKSPACE_MARKER_PREFIX}${owner}:${randomUUID()};pid=${process.pid};started=${new Date().toISOString()}${suffix}`;
}

/** Parse a lock reason; undefined when SuPi did not write it. */
export function parseAgentWorkspaceMarker(reason: string): ParsedAgentWorkspaceMarker | undefined {
  if (reason.startsWith(AGENT_WORKSPACE_MARKER_PREFIX)) {
    const match = /^supi-agent:([^:;]+):[^;]+;pid=(\d+);started=/.exec(reason);
    if (!match) return { legacy: false, disposable: false };
    return {
      owner: match[1],
      legacy: false,
      pid: Number(match[2]),
      disposable: /;disposable(;|$)/.test(reason),
    };
  }
  if (reason.startsWith(LEGACY_REVIEW_MARKER_PREFIX)) {
    const pid = /^supi-review:[^;]+;pid=(\d+);started=/.exec(reason)?.[1];
    // Review created only disposable workspaces before markers named their owner.
    return {
      owner: "review",
      legacy: true,
      disposable: true,
      ...(pid ? { pid: Number(pid) } : {}),
    };
  }
  return undefined;
}

/** Check whether the marker's process still runs; the answer is advisory because PIDs are reused. */
export function markerOwnerStatus(marker: ParsedAgentWorkspaceMarker): AgentWorkspaceOwnerStatus {
  if (marker.pid === undefined) return "unknown";
  try {
    process.kill(marker.pid, 0);
    return "active";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "absent" : "unknown";
  }
}
