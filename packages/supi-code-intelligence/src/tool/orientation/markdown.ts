import { type ReadNextItem, renderReadNextSection } from "../../analysis/read-next.ts";
import type { OrientationSection } from "../../ui/markdown/types.ts";

export interface RenderedOrientationSection {
  key: OrientationSection;
  title: string;
  lines: string[];
}

export interface RenderOrientationParams {
  focusTarget: string | null;
  sections: RenderedOrientationSection[];
  readNext?: ReadNextItem[];
}

/** Render a symbol-centered code_orientation result into markdown. */
export function renderOrientationResult(params: RenderOrientationParams): string {
  const lines: string[] = ["# Code Orientation", ""];

  if (params.focusTarget) {
    lines.push("## Focus", `- \`${params.focusTarget}\``, "");
  }

  for (const section of params.sections) {
    lines.push(`## ${section.title}`);
    if (section.lines.length > 0) {
      lines.push(...section.lines);
    }
    lines.push("");
  }

  lines.push(...renderReadNextSection(params.readNext ?? []));

  return lines.join("\n");
}
