import type { ContextSection } from "../../use-case/types.ts";

export interface RenderedContextSection {
  key: ContextSection;
  title: string;
  lines: string[];
}

export interface RenderContextParams {
  task: string;
  focusTarget: string | null;
  sections: RenderedContextSection[];
  nextQueries?: string[];
}

/** Render a task-focused code_context bundle into markdown. */
export function renderContextResult(params: RenderContextParams): string {
  const lines: string[] = ["# Code Context", "", "## Task Context", ""];

  lines.push(`- Task: ${params.task}`);
  if (params.focusTarget) {
    lines.push(`- Focus: \`${params.focusTarget}\``);
  }
  lines.push("");

  for (const section of params.sections) {
    lines.push(`## ${section.title}`);
    if (section.lines.length > 0) {
      lines.push(...section.lines);
    }
    lines.push("");
  }

  return lines.join("\n");
}
