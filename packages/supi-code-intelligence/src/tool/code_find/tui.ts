/** TUI renderer for code_find. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  formatCallValue,
  type ResultOptios,
  renderSimpleResult,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import { CODE_FIND_MODES } from "./modes.ts";

/** Render the compact code_find call header. */
export function renderFindCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  // Streaming calls arrive partial, so every level is read defensively.
  const search = ((args ?? {}) as { search?: unknown }).search;
  const branches = (search && typeof search === "object" ? search : {}) as Record<
    string,
    { query?: unknown; kind?: unknown } | undefined
  >;
  const mode = CODE_FIND_MODES.find((candidate) => branches[candidate] !== undefined);
  const branch = (mode ? branches[mode] : undefined) ?? {};

  let content = theme.fg("toolTitle", "code_find");
  const query = formatCallValue(branch.query);
  if (query) content += ` ${theme.fg("accent", JSON.stringify(query))}`;
  content += ` ${theme.fg("muted", mode ?? "mode?")}`;

  const kind = formatCallValue(branch.kind, 30);
  if (kind) content += theme.fg("dim", ` [${kind}]`);

  return new Text(content, 0, 0);
}

/** Render code_find progress, status, and structured result details. */
export function renderFindResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): ReturnType<typeof renderSimpleResult> {
  return renderSimpleResult(
    result,
    options,
    theme,
    { progress: "Searching…", failure: "code_find failed" },
    context,
  );
}
