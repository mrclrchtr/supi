import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  type CodeIntelligenceToolPromptSurfaceMap,
} from "./guidance.ts";
import {
  CODE_INTELLIGENCE_TOOL_SPECS,
  type CodeIntelligenceToolDefinitionSpec,
} from "./tool-specs.ts";
import { truncateToolContent } from "./truncate-output.ts";

/** Register the focused code-intelligence tool surface from shared specs. */
export function registerCodeIntelligenceTools(
  pi: ExtensionAPI,
  promptSurfaces: CodeIntelligenceToolPromptSurfaceMap = CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  specs: readonly CodeIntelligenceToolDefinitionSpec[] = CODE_INTELLIGENCE_TOOL_SPECS,
): void {
  for (const spec of specs) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: spec.parameters,
      // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
      execute: async (_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => {
        const { content, details } = await spec.run(params, {
          cwd: ctx.cwd,
          signal,
          onUpdate,
        });
        const { text } = truncateToolContent(content, {
          maxLines: spec.maxLines,
          maxBytes: spec.maxBytes,
        });
        return {
          content: [{ type: "text" as const, text }],
          details,
        };
      },
    });
  }
}
