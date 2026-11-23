import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Text } from "@earendil-works/pi-tui";
import { renderBatchCall } from "../background-render.ts";

/** Render the selected batch handle. */
export function renderCall(args: unknown, theme: Theme): Text {
  return renderBatchCall("Agent Cancel", args, theme);
}
