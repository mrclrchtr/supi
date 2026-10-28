import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  type ConsultingDeniedOperation,
  type ConsultingFileResource,
  MAX_FAILURE_RESOURCE_PATH_CHARS,
  MAX_FAILURE_RESOURCES,
} from "../../errors.ts";
import {
  eventStatus,
  eventType,
  extractWorkspacePath,
  isErrorStatus,
  isRecord,
  isSuccessStatus,
  normalizeToolName,
  safeString,
  structuredWorkspacePath,
  toolInput,
} from "./event-values.ts";

/** Reduce known tool names to fixed diagnostic categories, without retaining arbitrary names. */
export function classifyDeniedOperation(name: string | undefined): ConsultingDeniedOperation {
  switch (name) {
    case "command":
    case "run_command":
    case "run_terminal_command":
      return "command";
    case "read_file":
    case "view_file":
    case "view_file_outline":
    case "view_file_item":
    case "list_dir":
    case "list_files":
    case "find_by_name":
    case "grep_search":
    case "code_search":
      return "file-read";
    case "write_file":
    case "write_to_file":
    case "replace_file_content":
    case "multi_replace_file_content":
    case "apply_patch":
      return "file-write";
    case "search_web":
    case "read_url_content":
    case "read_url":
    case "web_search":
      return "web-read";
    case "execute_url":
    case "browser_subagent":
      return "browser";
    default:
      return name === "mcp" || name?.startsWith("mcp_") ? "mcp" : "other";
  }
}

/** Classify result events, preserving their legacy implicit-success default when status is omitted. */
export function classifyToolResult(event: Record<string, unknown>): {
  kind: "pending" | "failure" | "success";
  denied: boolean;
} {
  const status = eventStatus(event);
  const denied = isPermissionDenial(event);
  if (denied || isErrorStatus(status)) return { kind: "failure", denied };
  return { kind: isSuccessStatus(status) ? "success" : "pending", denied };
}

/** Fixed operation minima from terminal summaries, with no inferred call IDs or file targets. */
export function terminalDeniedOperations(
  event: Record<string, unknown>,
): Map<ConsultingDeniedOperation, string> {
  const operations = new Map<ConsultingDeniedOperation, string>();
  if (!Array.isArray(event.denied_actions)) return operations;
  for (const action of event.denied_actions) {
    const name = isRecord(action) ? safeString(action.action, 80) : undefined;
    if (!name) continue;
    const normalizedName = normalizeToolName(name);
    operations.set(classifyDeniedOperation(normalizedName), normalizedName);
  }
  return operations;
}

/** Extract a file target: undefined means omitted; null means explicitly supplied but unavailable. */
function requestedFileResource(
  name: string | undefined,
  event: Record<string, unknown>,
): ConsultingFileResource | null | undefined {
  const operation = classifyDeniedOperation(name);
  if (operation !== "file-read" && operation !== "file-write") return undefined;
  const field = structuredWorkspacePath(toolInput(event) ?? event);
  if (!field) return undefined;
  const path = field.value;
  return typeof path === "string" &&
    path.length > 0 &&
    path.length <= MAX_FAILURE_RESOURCE_PATH_CHARS
    ? { operation, requestedPath: path }
    : null;
}

/** Bounded, deduplicated requested targets for one category of file observations. */
export class FileResources {
  #resources: ConsultingFileResource[] = [];
  #omitted = 0;
  #unavailable = 0;

  /** Record an observation, counting absent targets and capacity omissions without guessing. */
  record(operation: ConsultingDeniedOperation, resource?: ConsultingFileResource | null): void {
    if (operation !== "file-read" && operation !== "file-write") return;
    if (!resource || resource.operation !== operation) {
      this.#unavailable += 1;
      return;
    }
    if (
      this.#resources.some(
        (item) => item.operation === operation && item.requestedPath === resource.requestedPath,
      )
    )
      return;
    if (this.#resources.length === MAX_FAILURE_RESOURCES) {
      this.#omitted += 1;
      return;
    }
    this.#resources.push({ ...resource });
  }

  /** Copy metadata only; neither raw payloads nor inferred outcomes are exposed. */
  get snapshot() {
    return {
      resources: this.#resources.map((resource) => ({ ...resource })),
      omitted: this.#omitted,
      unavailable: this.#unavailable,
    };
  }
}

/** Recognize denial observations without retaining the raw error or tool output. */
export function isPermissionDenial(event: Record<string, unknown>): boolean {
  const status = eventStatus(event);
  if (["denied", "permission_denied", "forbidden", "blocked"].includes(status ?? "")) return true;
  const type = eventType(event);
  if (type.includes("permission") || type.includes("denied") || type.includes("blocked"))
    return true;
  const hasExplicitFailure =
    event.is_error === true ||
    event.isError === true ||
    isErrorStatus(status) ||
    event.error !== undefined ||
    event.reason !== undefined;
  if (!hasExplicitFailure) return false;
  const message = [event.error, event.reason, event.message, event.content]
    .map((value) => safeDenialText(value))
    .join(" ")
    .toLowerCase();
  return message.includes("permission") || message.includes("denied");
}

function safeDenialText(value: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (typeof value === "string") return value.slice(0, 4_000);
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => safeDenialText(item, depth + 1))
      .join(" ");
  }
  if (!isRecord(value)) return "";
  return ["text", "message", "content", "error", "reason"]
    .map((key) => safeDenialText(value[key], depth + 1))
    .join(" ");
}

/** Approved filesystem roots for diagnostic location classification, not permission enforcement. */
export interface DiagnosticReadScope {
  workspaceDirectory?: string;
  additionalReadOnlyDirectories?: readonly string[];
}

/** Correlated target facts; null invalidates an earlier resource instead of reviving a stale path. */
export interface FileTargetObservation {
  requestedResource?: ConsultingFileResource | null;
  outsideReadRoots?: boolean;
}

/** Preserve earlier facts only when a path is omitted; explicit replacements supersede both facts. */
export function fileTargetUpdate(
  name: string | undefined,
  event: Record<string, unknown>,
  scope: DiagnosticReadScope,
  previous?: FileTargetObservation,
): FileTargetObservation {
  const operation = classifyDeniedOperation(name);
  if (operation !== "file-read" && operation !== "file-write") return {};
  const resource = requestedFileResource(name, event);
  return resource === undefined
    ? {
        requestedResource: previous?.requestedResource,
        outsideReadRoots: previous?.outsideReadRoots,
      }
    : {
        requestedResource: resource,
        outsideReadRoots: fileAccessOutsideReadRoots(name, event, scope),
      };
}

/**
 * Classify the requested file location independently of the denial cause. Resolve
 * aliases (including missing targets' existing parents); inaccessible paths and
 * parent traversal stay unknown rather than relying on lexical symlink semantics.
 */
export function fileAccessOutsideReadRoots(
  name: string | undefined,
  event: Record<string, unknown>,
  scope: DiagnosticReadScope,
): boolean | undefined {
  const operation = classifyDeniedOperation(name);
  if (operation !== "file-read" && operation !== "file-write") return undefined;
  const path = extractWorkspacePath(toolInput(event) ?? event, { preserveWhitespace: true });
  if (!path || !scope.workspaceDirectory) return undefined;
  // Resolving '..' lexically can erase a symlink before its destination is inspected.
  if (path.split(/[\\/]/).includes("..")) return undefined;
  const target = canonicalDiagnosticPath(resolve(scope.workspaceDirectory, path));
  const roots = [scope.workspaceDirectory, ...(scope.additionalReadOnlyDirectories ?? [])].map(
    canonicalDiagnosticPath,
  );
  if (!target || roots.some((root) => root === undefined)) return undefined;
  return !roots.some((root) => {
    if (!root) return false;
    const distance = relative(root, target);
    return (
      distance === "" || (!isAbsolute(distance) && distance !== ".." && !distance.startsWith("../"))
    );
  });
}

function canonicalDiagnosticPath(path: string): string | undefined {
  let candidate = path;
  const suffix: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync(candidate), ...suffix.reverse());
    } catch (error) {
      if (!canResolveParent(candidate, error)) return undefined;
      const parent = dirname(candidate);
      if (parent === candidate) return undefined;
      suffix.push(basename(candidate));
      candidate = parent;
    }
  }
}

function canResolveParent(path: string, error: unknown): boolean {
  if (!isRecord(error) || !["ENOENT", "ENOTDIR"].includes(String(error.code))) return false;
  try {
    // A dangling symlink is not a lexical child of its containing directory.
    return !lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink();
  } catch {
    return false;
  }
}
