import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import type { ToolResult } from "./common.ts";

const MAX_FAILURE_TEXT_CHARACTERS = 4096;
const MAX_COLLAPSED_FAILURE_ROWS = 2;
const MAX_EXPANDED_FAILURE_ROWS = 20;

/** PI execution state and presentation for a failed tool call. */
interface ExecutionErrorOptions {
  isError?: boolean;
  expanded: boolean;
  label: string;
}

interface FailureReason {
  text: string;
  limited: boolean;
}

/**
 * Show a failure reason only when PI marks the execution as failed.
 * PI throws can have plain content without details. This text is a failure
 * body, not Markdown from which the renderer infers tool evidence.
 */
export function renderExecutionError(
  result: ToolResult,
  options: ExecutionErrorOptions,
  theme: Theme,
): Component | null {
  if (!options.isError) return null;
  return new ExecutionError(readFailureReason(result), options, theme);
}

function readFailureReason(result: ToolResult): FailureReason {
  const message = plainFailureText(result.details?.message);
  if (message) return boundFailureReason(message);
  let text = "";
  for (const block of Array.isArray(result.content) ? result.content : []) {
    if (block?.type !== "text") continue;
    const part = plainFailureText(block.text);
    if (!part) continue;
    text += `${text ? "\n" : ""}${part}`;
    if (text.length > MAX_FAILURE_TEXT_CHARACTERS) break;
  }
  return boundFailureReason(text);
}

function boundFailureReason(text: string): FailureReason {
  return {
    text: text.slice(0, MAX_FAILURE_TEXT_CHARACTERS),
    limited: text.length > MAX_FAILURE_TEXT_CHARACTERS,
  };
}

function plainFailureText(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripVTControlCharacters(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, (character) => (character === "\n" ? character : ""))
    .trim();
}

/** Bound physical rows after wrapping, so narrow terminals keep the same row limit. */
class ExecutionError implements Component {
  constructor(
    private readonly reason: FailureReason,
    private readonly options: ExecutionErrorOptions,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    const { expanded, label } = this.options;
    const body = expanded ? this.reason.text : this.reason.text.replace(/\s+/g, " ");
    const text = `${label}${body ? `\n${body}` : ""}`;
    const rows = new Text(this.theme.fg("error", text), 0, 0).render(width);
    const maxRows = expanded ? MAX_EXPANDED_FAILURE_ROWS : MAX_COLLAPSED_FAILURE_ROWS;
    if (!this.reason.limited && rows.length <= maxRows) return rows;
    const disclosure = expanded
      ? "Failure text limited."
      : "Failure text limited; expand for more.";
    return [
      ...rows.slice(0, maxRows),
      ...new Text(this.theme.fg("dim", disclosure), 0, 0).render(width),
    ];
  }

  /** Text and theme formatting are rebuilt on every render; there is no cache. */
  invalidate(): void {}
}
