// Code Intelligence extension entry point — registers the `code_intel` tool with pi.
// Provides architecture briefs, caller/callee analysis, impact assessment, and pattern search.

import { StringEnum } from "@mariozechner/pi-ai";
import type { BeforeAgentStartEventResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { buildArchitectureModel } from "./architecture.ts";
import { generateOverview } from "./brief.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { type CodeIntelAction, executeAction } from "./tool-actions.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

const CodeIntelActionEnum = StringEnum([
  "brief",
  "callers",
  "callees",
  "implementations",
  "affected",
  "pattern",
] as const);

/**
 * Register the `code_intel` tool and inject a lightweight architecture overview
 * once per session.
 */
export default function codeIntelligenceExtension(pi: ExtensionAPI) {
  let hasInjectedOverview = false;

  pi.on("session_start", (_event, ctx) => {
    hasInjectedOverview = false;

    // Scan active branch for existing overview to avoid duplicates on reload/resume
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (entry.type === "custom_message" && entry.customType === OVERVIEW_CUSTOM_TYPE) {
        hasInjectedOverview = true;
        break;
      }
    }
  });

  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      if (hasInjectedOverview) return;
      hasInjectedOverview = true;

      const model = await buildArchitectureModel(ctx.cwd);
      if (!model || model.modules.length === 0) return;

      const overview = generateOverview(model);
      if (!overview) return;

      return {
        message: {
          customType: OVERVIEW_CUSTOM_TYPE,
          display: false,
          content: overview,
        },
      };
    },
  );

  pi.registerTool({
    name: "code_intel",
    label: "Code Intelligence",
    description: toolDescription,
    parameters: Type.Object({
      action: CodeIntelActionEnum,
      path: Type.Optional(
        Type.String({ description: "Scope or focus path (package, directory, or file)" }),
      ),
      file: Type.Optional(
        Type.String({ description: "Anchored target file (use with line/character)" }),
      ),
      line: Type.Optional(Type.Number({ description: "1-based line number for anchored target" })),
      character: Type.Optional(
        Type.Number({ description: "1-based character column (UTF-16) for anchored target" }),
      ),
      symbol: Type.Optional(
        Type.String({ description: "Symbol name for discovery-based resolution" }),
      ),
      pattern: Type.Optional(
        Type.String({
          description: "Text search pattern (pattern action only; literal by default)",
        }),
      ),
      regex: Type.Optional(
        Type.Boolean({
          description: "Use regex semantics for pattern action (default: false, literal search)",
        }),
      ),
      kind: Type.Optional(Type.String({ description: "Symbol kind filter for discovery" })),
      exportedOnly: Type.Optional(
        Type.Boolean({ description: "Limit discovery to exported symbols" }),
      ),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return" })),
      contextLines: Type.Optional(Type.Number({ description: "Context lines around matches" })),
    }),
    promptSnippet,
    promptGuidelines,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await executeAction(
        params as unknown as { action: CodeIntelAction } & Record<string, unknown>,
        { cwd: ctx.cwd },
      );
      return {
        content: [{ type: "text", text: result }],
        details: undefined,
      };
    },
  });
}
