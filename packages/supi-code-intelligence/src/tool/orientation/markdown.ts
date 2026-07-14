import { renderReadNextSection } from "../../analysis/read-next.ts";
import type { OrientationResultData } from "../../session/orientation-types.ts";

/** Render assembled Orientation blocks into the model-facing markdown adapter. */
export function renderOrientationResult(data: OrientationResultData): string {
  const lines: string[] = [];
  for (const block of data.blocks) {
    switch (block.kind) {
      case "heading":
        lines.push(`${"#".repeat(block.level)} ${block.text}`);
        break;
      case "paragraph":
        lines.push(block.text);
        break;
      case "list-item":
        lines.push(`- ${block.text}`);
        break;
      case "code":
        lines.push(`\`\`\`${block.language ?? ""}`, ...block.lines, "```");
        break;
      case "blank":
        lines.push("");
        break;
    }
  }
  lines.push(...renderReadNextSection([...data.readNext]));
  return lines.join("\n").trimEnd();
}
