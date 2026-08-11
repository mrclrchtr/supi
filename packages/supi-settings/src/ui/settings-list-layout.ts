import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const DESCRIPTION_VIEWPORT_HEIGHT = 4;

/** Render a fixed-height description preview so selection changes do not resize the menu. */
export function renderDescriptionViewport(
  description: string | undefined,
  width: number,
): string[] {
  const contentWidth = Math.max(1, width - 4);
  const wrapped = description ? wrapTextWithAnsi(description, contentWidth) : [];
  const visible = wrapped.slice(0, DESCRIPTION_VIEWPORT_HEIGHT);
  if (wrapped.length > DESCRIPTION_VIEWPORT_HEIGHT) {
    const lastIndex = DESCRIPTION_VIEWPORT_HEIGHT - 1;
    visible[lastIndex] = truncateToWidth(`${visible[lastIndex] ?? ""}…`, contentWidth, "…");
  }
  while (visible.length < DESCRIPTION_VIEWPORT_HEIGHT) visible.push("");
  return visible;
}
