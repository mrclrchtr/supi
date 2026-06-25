import type { ContextSection } from "../../use-case/types.ts";
import { type ReadNextItem, renderReadNextSection } from "./read-next.ts";

export interface RenderedContextSection {
  key: ContextSection;
  title: string;
  lines: string[];
}

export interface RenderContextParams {
  focusTarget: string | null;
  sections: RenderedContextSection[];
  readNext?: ReadNextItem[];
}

/** Render a symbol-centered code_orientation result into markdown. */
export function renderContextResult(params: RenderContextParams): string {
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
