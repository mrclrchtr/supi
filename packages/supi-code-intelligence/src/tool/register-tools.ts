import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { renderContextCall, renderContextResult } from "../presentation/tui/context.ts";
import { renderFindCall, renderFindResult } from "../presentation/tui/find.ts";
import { renderGraphCall, renderGraphResult } from "../presentation/tui/graph.ts";
import { renderHealthCall, renderHealthResult } from "../presentation/tui/health.ts";
import { renderImpactCall, renderImpactResult } from "../presentation/tui/impact.ts";
import { renderInspectCall, renderInspectResult } from "../presentation/tui/inspect.ts";
import {
  renderRefactorApplyCall,
  renderRefactorApplyResult,
} from "../presentation/tui/refactor-apply.ts";
import {
  renderRefactorPlanCall,
  renderRefactorPlanResult,
} from "../presentation/tui/refactor-plan.ts";
import { renderResolveCall, renderResolveResult } from "../presentation/tui/resolve.ts";
import {
  CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  type CodeIntelligenceToolPromptSurfaceMap,
} from "./guidance.ts";
import {
  CODE_INTELLIGENCE_TOOL_SPECS,
  type CodeIntelligenceToolDefinitionSpec,
} from "./tool-specs.ts";
import { truncateToolContent } from "./truncate-output.ts";

interface ToolRenderer {
  // biome-ignore lint/suspicious/noExplicitAny: pi render call/result signatures vary per tool; spread into pi.registerTool where concrete typing handles variance
  renderCall?: (...args: any[]) => Component;
  // biome-ignore lint/suspicious/noExplicitAny: same variance reason as renderCall
  renderResult?: (...args: any[]) => Component;
  renderShell?: "self";
}

function getToolRenderer(name: string): ToolRenderer {
  switch (name) {
    case "code_graph":
      return {
        renderCall: renderGraphCall,
        renderResult: renderGraphResult,
      };
    case "code_health":
      return {
        renderCall: renderHealthCall,
        renderResult: renderHealthResult,
      };
    case "code_context":
      return {
        renderCall: renderContextCall,
        renderResult: renderContextResult,
      };
    case "code_resolve":
      return { renderCall: renderResolveCall, renderResult: renderResolveResult };
    case "code_inspect":
      return { renderCall: renderInspectCall, renderResult: renderInspectResult };
    case "code_find":
      return { renderCall: renderFindCall, renderResult: renderFindResult };
    case "code_impact":
      return { renderCall: renderImpactCall, renderResult: renderImpactResult };
    case "code_refactor_plan":
      return {
        renderCall: renderRefactorPlanCall,
        renderResult: renderRefactorPlanResult,
      };
    case "code_refactor_apply":
      return {
        renderCall: renderRefactorApplyCall,
        renderResult: renderRefactorApplyResult,
      };
    default:
      return {};
  }
}

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
        const { text, truncated } = truncateToolContent(content, {
          maxLines: spec.maxLines,
          maxBytes: spec.maxBytes,
        });
        if (truncated && spec.spillToTempFile && content.length > 0) {
          const dir = mkdtempSync(join(tmpdir(), "supi-ci-"));
          const spillPath = join(dir, `${spec.name}-output.md`);
          writeFileSync(spillPath, content, "utf-8");
          const notice = `\n_Full output saved to: \`${spillPath}\`_`;
          return {
            content: [{ type: "text" as const, text: text + notice }],
            details,
          };
        }
        return {
          content: [{ type: "text" as const, text }],
          details,
        };
      },
      ...getToolRenderer(spec.name),
    });
  }
}
