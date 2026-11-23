import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/** Compact handle-based call header, including incomplete streamed arguments. */
export function renderBatchCall(label: string, args: unknown, theme: Theme): Text {
  const input = args as { batchId?: string; wait?: boolean } | undefined;
  return new Text(
    `${theme.fg("toolTitle", label)} ${theme.fg("dim", input?.batchId ?? "")}${input?.wait ? " · wait" : ""}`,
    0,
    0,
  );
}

/** Bounded error text shared by the background control tools. */
export function renderBatchError(
  result: { content?: { type: string; text?: string }[] },
  theme: Theme,
): Text {
  const text =
    result.content?.find((part) => part.type === "text")?.text ?? "Agent operation failed.";
  return new Text(theme.fg("error", text.slice(0, 2_000)), 0, 0);
}
