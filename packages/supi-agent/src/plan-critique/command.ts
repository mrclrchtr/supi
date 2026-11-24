import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  type AgentRunOutcome,
  createAgentRunProviderAuthority,
  createDebugAgentRunRetrospective,
  getAgentRunRegistry,
  openAgentsViewer,
  startRegisteredAgentRun,
  withCancellableLoader,
} from "@mrclrchtr/supi-agent-runtime/api";
import { makeReadinessCheck } from "../capabilities.ts";
import { buildModelContext, resolveAgentProfile } from "../model-policy.ts";
import { resolveAgentDirectory } from "../resources.ts";
import { PLAN_CRITIC_PROFILE, PLAN_CRITIC_PROFILE_ID } from "./profile.ts";
import { buildPlanCriticPrompt, framePlanCritique } from "./prompt.ts";

/** Slash command name, without the leading slash. */
export const PLAN_CRITIQUE_COMMAND = "supi-plan-critique";

const WORKING_SOURCE = "supi-agent";

/** Result of reading the Plan Author's last answer from the active branch. */
type LastAnswer = { kind: "text"; text: string } | { kind: "refused"; message: string };

/**
 * Register `/supi-plan-critique`. Not yet called from the extension entry point;
 * the command stays unreachable for users until its release.
 */
export function registerPlanCritiqueCommand(pi: ExtensionAPI): void {
  pi.registerCommand(PLAN_CRITIQUE_COMMAND, {
    description: "Let an independent Plan Critic check the last answer and hand its critique back",
    handler: (_args, ctx) => runPlanCritique(pi, ctx),
  });
}

async function runPlanCritique(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    if (ctx.hasUI) ctx.ui.notify("Plan Critique runs only in the interactive TUI.", "warning");
    return;
  }
  if (!ctx.isIdle()) {
    ctx.ui.notify("Wait until the agent has finished before starting a Plan Critique.", "warning");
    return;
  }
  const answer = readLastAnswer(ctx);
  if (answer.kind === "refused") {
    ctx.ui.notify(answer.message, "warning");
    return;
  }

  const modelContext = buildModelContext(ctx);
  const resolved = resolveAgentProfile(PLAN_CRITIC_PROFILE, modelContext, {
    cwd: ctx.cwd,
    agentDir: resolveAgentDirectory(),
    projectTrusted: ctx.isProjectTrusted(),
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
  });
  if ("code" in resolved) {
    ctx.ui.notify(`Plan Critique cannot start: ${resolved.message}`, "error");
    return;
  }

  pi.events.emit("supi:working:start", { source: WORKING_SOURCE });
  try {
    const outcome = await withCancellableLoader(
      ctx,
      "Plan Critic is checking the plan…",
      async (signal) => {
        const registry = getAgentRunRegistry(pi);
        const runKey = randomUUID();
        const batchId = randomUUID();
        const handle = startRegisteredAgentRun<string>({
          inputs: resolved.inputs,
          prompt: buildPlanCriticPrompt(answer.text),
          signal,
          readinessCheck: makeReadinessCheck(resolved.inputs.tools),
          completionResolver: (session) => session.getLastAssistantText(),
          retrospective: createDebugAgentRunRetrospective({
            source: WORKING_SOURCE,
            runKey,
            batchId,
            taskId: PLAN_CRITIC_PROFILE_ID,
            label: "plan critique",
            cwd: ctx.cwd,
          }),
          registry,
          registration: {
            metadata: {
              runKey,
              batchId,
              taskId: PLAN_CRITIC_PROFILE_ID,
              kind: "Plan Critic",
              label: "plan critique",
              cwd: resolved.inputs.cwd,
              modelId: `${resolved.model.provider}/${resolved.model.id}`,
              thinkingLevel: resolved.thinkingLevel,
              tools: resolved.inputs.tools,
              taskDescription: "Independent check of the last agent answer.",
              startedAt: Date.now(),
            },
          },
          transcriptSystemPrompt: PLAN_CRITIC_PROFILE.customSystemPrompt,
        });
        try {
          const result = await handle.taskResult;
          registry.setDisplayResult(handle.runKey, displayResult(result));
          return result;
        } catch (error) {
          registry.setDisplayResult(handle.runKey, { failureCode: "unexpected-runner-failure" });
          throw error;
        }
      },
      {
        openAgents: () => openAgentsViewer(pi, ctx),
        failureMessage: "Plan Critique failed unexpectedly.",
      },
    );
    // A rejected run was already reported by the loader.
    if (outcome) deliverCritique(pi, ctx, outcome);
  } finally {
    pi.events.emit("supi:working:end", { source: WORKING_SOURCE });
  }
}

/** Send the framed critique, or report why nothing was sent. */
function deliverCritique(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  outcome: AgentRunOutcome<string | undefined>,
): void {
  if (outcome.kind !== "success") {
    ctx.ui.notify(failureNotice(outcome), outcome.kind === "canceled" ? "info" : "error");
    return;
  }
  const critique = outcome.value?.trim();
  if (!critique) {
    ctx.ui.notify("The Plan Critic ended without a closing message. Nothing was sent.", "error");
    return;
  }
  const message = framePlanCritique(critique);
  // pi.sendUserMessage() reports a busy session only through Pi's extension error channel.
  if (!ctx.isIdle()) {
    // Keep a draft the user typed while the run was active.
    const draft = ctx.ui.getEditorText();
    ctx.ui.setEditorText(draft.trim() ? `${draft}\n\n${message}` : message);
    ctx.ui.notify(
      draft.trim()
        ? "The agent became busy, so the critique was not sent. It was added after your draft in the editor; submit it when the agent is idle."
        : "The agent became busy, so the critique was not sent. It is in the editor; submit it when the agent is idle.",
      "warning",
    );
    return;
  }
  pi.sendUserMessage(message);
}

function failureNotice(outcome: Exclude<AgentRunOutcome<unknown>, { kind: "success" }>): string {
  if (outcome.kind === "canceled") return "Plan Critique canceled. Nothing was sent.";
  if (outcome.kind === "timeout") return "Plan Critique timed out. Nothing was sent.";
  return `Plan Critique failed (${outcome.failureCode}). Nothing was sent.`;
}

function displayResult(outcome: AgentRunOutcome<string | undefined>) {
  if (outcome.kind === "success") return outcome.value ? { finalText: outcome.value } : {};
  if (outcome.kind === "failed") return { failureCode: outcome.failureCode };
  return { failureCode: outcome.kind };
}

/**
 * Read the text of the last assistant message on the active branch, verbatim.
 * Text blocks are joined without separators, as Pi's `getLastAssistantText()` does.
 */
function readLastAnswer(ctx: ExtensionCommandContext): LastAnswer {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    const message = entry.message;
    if (message.stopReason === "aborted" || message.stopReason === "error") {
      return {
        kind: "refused",
        message: "The last agent answer is incomplete. Let the agent finish it first.",
      };
    }
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (!text.trim()) {
      return { kind: "refused", message: "The last agent answer has no text to critique." };
    }
    return { kind: "text", text };
  }
  return { kind: "refused", message: "There is no agent answer to critique yet." };
}
