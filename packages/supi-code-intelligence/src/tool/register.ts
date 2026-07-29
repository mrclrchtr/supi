import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import { renderFindCall, renderFindResult } from "./find/tui.ts";
import { renderGraphCall, renderGraphResult } from "./graph/tui.ts";
import {
  CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  type CodeIntelligenceToolPromptSurfaceMap,
} from "./guidance.ts";
import { renderHealthCall, renderHealthResult } from "./health/tui.ts";
import { truncateToolContent } from "./infra/truncate.ts";
import { renderInspectCall, renderInspectResult } from "./inspect/tui.ts";
import { renderOrientationCall, renderOrientationResult } from "./orientation/tui.ts";
import { renderRefactorApplyCall, renderRefactorApplyResult } from "./refactor-apply/tui.ts";
import { renderRefactorPlanCall, renderRefactorPlanResult } from "./refactor-plan/tui.ts";
import { renderResolveCall, renderResolveResult } from "./resolve/tui.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS, type CodeIntelligenceToolDefinitionSpec } from "./specs.ts";

const TOOL_OUTPUT_CONTRACT =
  " Output over 2000 lines or 50KB is truncated, with full Markdown saved to a temporary file.";

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
    case "code_orientation":
      return {
        renderCall: renderOrientationCall,
        renderResult: renderOrientationResult,
      };
    case "code_resolve":
      return { renderCall: renderResolveCall, renderResult: renderResolveResult };
    case "code_inspect":
      return { renderCall: renderInspectCall, renderResult: renderInspectResult };
    case "code_find":
      return { renderCall: renderFindCall, renderResult: renderFindResult };
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

/**
 * Register the focused code-intelligence tool surface from shared specs.
 *
 * @param getOrCreateSession — session factory; production passes the app-managed
 *   sessions, tests pass a `createSessionCache`-backed factory.
 */
const registeredPis = new WeakSet<object>();

export function registerCodeIntelligenceTools(
  pi: ExtensionAPI,
  getOrCreateSession: (cwd: string) => WorkspaceCodeIntelligenceSession,
  promptSurfaces: CodeIntelligenceToolPromptSurfaceMap = CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  specs: readonly CodeIntelligenceToolDefinitionSpec[] = CODE_INTELLIGENCE_TOOL_SPECS,
): void {
  // Skip when another copy is already loaded (e.g. standalone install + bundled
  // copy inside supi-review). Pi loads packages with separate module roots, so
  // module-level state is not shared. Key on the pi object: both copies receive
  // the same ExtensionAPI in one process, while tests get fresh mocks.
  // ponytail: WeakSet on pi identity; getAllTools() is not callable during load.
  if (registeredPis.has(pi)) return;
  registeredPis.add(pi);

  for (const spec of specs) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description + TOOL_OUTPUT_CONTRACT,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: spec.parameters,
      // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
      execute: async (_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => {
        const session = getOrCreateSession(ctx.cwd);
        session.setProjectTrusted(ctx.isProjectTrusted());
        const { content, details } = await spec.run(params, {
          cwd: ctx.cwd,
          signal,
          onUpdate,
          session,
        });
        const { text, truncated } = truncateToolContent(content, {
          maxLines: spec.maxLines,
          maxBytes: spec.maxBytes,
        });
        if (truncated && content.length > 0) {
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
