import { createHmac, randomBytes } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordDebugEvent, startDebugTimer } from "@mrclrchtr/supi-core/debug";
import { truncateIdentity } from "@mrclrchtr/supi-lsp/debug-telemetry";
import type { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import {
  CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
  type CodeIntelligenceToolPromptSurfaceMap,
} from "./guidance.ts";
import { boundCodeToolResult } from "./infra/truncate.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS, type CodeIntelligenceToolDefinitionSpec } from "./specs.ts";

/**
 * Register the focused code-intelligence tool surface from shared specs.
 *
 * @param getOrCreateSession — session factory; production passes the app-managed
 *   sessions, tests pass a `createSessionCache`-backed factory.
 */
const registeredPis = new WeakSet<object>();

type CodeOperationOutcome = "completed" | "failed" | "canceled";

function createDebugOperationId(secret: Buffer, toolCallId: string): string {
  const digest = createHmac("sha256", secret).update(toolCallId).digest().subarray(0, 16);
  return `op-${digest.toString("base64url")}`;
}

function recordCodeOperationBoundary(
  category: "code-operation.start" | "code-operation.finish",
  operationId: string,
  tool: string,
  options: { cwd: string; outcome?: CodeOperationOutcome },
): void {
  recordDebugEvent({
    operationId,
    source: "code-intelligence",
    level: "debug",
    category,
    message:
      category === "code-operation.start" ? "Code operation started" : "Code operation finished",
    cwd: truncateIdentity(options.cwd),
    data: options.outcome ? { tool, outcome: options.outcome } : { tool },
  });
}

function recordCodeWorkflowTiming(
  timer: ReturnType<typeof startDebugTimer>,
  operationId: string,
  tool: string,
  options: { cwd: string; outcome: CodeOperationOutcome },
): void {
  timer.finish(
    {
      operationId,
      source: "code-intelligence",
      level: "debug",
      category: "workflow.timing",
      message: "Code workflow finished",
      cwd: truncateIdentity(options.cwd),
      data: { tool, outcome: options.outcome },
    },
    "workflow",
  );
}

function terminalCodeOperationOutcome(
  error: unknown,
  signal: AbortSignal | undefined,
): CodeOperationOutcome {
  if (signal?.aborted) return "canceled";
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "CodeRequestDeadlineError")
  ) {
    return "canceled";
  }
  return "failed";
}

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
  const operationSecret = randomBytes(32);

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
      execute: async (toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => {
        const operationId = createDebugOperationId(operationSecret, toolCallId);
        const workflowTimer = startDebugTimer();
        recordCodeOperationBoundary("code-operation.start", operationId, spec.name, {
          cwd: ctx.cwd,
        });
        try {
          const session = getOrCreateSession(ctx.cwd);
          session.setProjectTrusted(ctx.isProjectTrusted());
          const { content, details } = await spec.run(params, {
            cwd: ctx.cwd,
            operationId,
            signal,
            onUpdate,
            session,
          });
          recordCodeWorkflowTiming(workflowTimer, operationId, spec.name, {
            cwd: ctx.cwd,
            outcome: "completed",
          });
          recordCodeOperationBoundary("code-operation.finish", operationId, spec.name, {
            cwd: ctx.cwd,
            outcome: "completed",
          });
          return boundCodeToolResult(content, details, {
            toolName: spec.name,
            maxLines: spec.maxLines,
            maxBytes: spec.maxBytes,
          });
        } catch (error) {
          const outcome = terminalCodeOperationOutcome(error, signal);
          recordCodeWorkflowTiming(workflowTimer, operationId, spec.name, {
            cwd: ctx.cwd,
            outcome,
          });
          recordCodeOperationBoundary("code-operation.finish", operationId, spec.name, {
            cwd: ctx.cwd,
            outcome,
          });
          throw error;
        }
      },
      renderCall: spec.renderCall,
      renderResult: spec.renderResult,
    });
  }
}
