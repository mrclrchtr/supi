import { normalizeToolName } from "./process/event-values.ts";

/** Return whether a successful Antigravity tool name represents web activity. */
export function isWebToolName(name: string): boolean {
  const normalized = normalizeToolName(name);
  return ["search_web", "read_url_content", "read_url", "web_search"].includes(normalized);
}

/** Return whether a successful Antigravity tool name represents workspace activity. */
export function isWorkspaceToolName(name: string): boolean {
  const normalized = normalizeToolName(name);
  return (
    normalized.includes("file") ||
    normalized.includes("directory") ||
    normalized.includes("code_search") ||
    normalized.includes("search_code") ||
    normalized.includes("grep") ||
    normalized.includes("find") ||
    normalized.includes("glob") ||
    ["list_files", "list_dir", "read_file"].includes(normalized)
  );
}
