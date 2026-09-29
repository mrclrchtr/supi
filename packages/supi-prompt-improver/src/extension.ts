import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isDebugRegistryEnabled } from "@mrclrchtr/supi-core/debug";
import { loadPromptImproverConfig, registerPromptImproverSettings } from "./config.ts";
import { capturePromptImproverError, createPromptImproverDiagnostics } from "./diagnostics.ts";
import { resolvePromptImproverModel } from "./model.ts";
import { runPromptImprover } from "./workflow.ts";

interface ActiveRun {
  readonly token: object;
  readonly controller: AbortController;
  readonly diagnostics: ReturnType<typeof createPromptImproverDiagnostics>;
}

interface CommandRun {
  args: string;
  ctx: ExtensionCommandContext;
  selected: ConfiguredModel;
  run: ActiveRun;
  diagnostics: ReturnType<typeof createPromptImproverDiagnostics>;
  cleanup: () => void;
}

type ConfiguredModel = {
  model: NonNullable<ReturnType<typeof resolvePromptImproverModel>>;
  modelId: string;
};

/** Register `/supi-improve`, its model setting, and its lifecycle guards. */
export default function promptImproverExtension(pi: ExtensionAPI): void {
  registerPromptImproverSettings(pi);
  let active: ActiveRun | undefined;

  const stopActive = (reasonCode: string, recordTerminal: boolean) => {
    const run = active;
    if (!run) return;
    if (recordTerminal) run.diagnostics.finish("cancelled", reasonCode);
    run.diagnostics.invalidate();
    run.controller.abort();
  };
  pi.on("agent_start", () => stopActive("agent_started", true));
  pi.on("session_before_switch", () => stopActive("session_switch", true));
  pi.on("session_before_fork", () => stopActive("session_fork", true));
  pi.on("session_before_tree", () => stopActive("session_tree_change", true));
  pi.on("session_before_compact", () => stopActive("session_compaction", true));
  pi.on("session_start", () => stopActive("session_started", false));
  pi.on("session_shutdown", () => stopActive("session_shutdown", true));

  pi.registerCommand("supi-improve", {
    description:
      "Improve a draft without submitting it. Typing this command clears the editor, so pass the draft as arguments or enter it in the local form.",
    handler: async (args, ctx) => {
      const diagnostics = createPromptImproverDiagnostics(sessionIdReader(ctx));
      const rejection = commandEntryRejection(ctx, active);
      if (rejection) {
        ctx.ui.notify(rejection.message, "warning");
        diagnostics.record(
          "invocation",
          "warning",
          "Prompt improvement invocation rejected",
          () => ({
            outcome: "rejected",
            reasonCode: rejection.reasonCode,
          }),
        );
        diagnostics.finish("rejected", rejection.reasonCode);
        return;
      }
      const selection = resolveConfiguredModel(ctx);
      if (!selection.selected) {
        diagnostics.record(
          "invocation",
          "warning",
          "Prompt improvement invocation rejected",
          () => ({
            outcome: "rejected",
            reasonCode: selection.reasonCode,
          }),
        );
        diagnostics.finish("rejected", selection.reasonCode);
        return;
      }
      const selected = selection.selected;
      diagnostics.record("invocation", "info", "Prompt improvement invocation started", () => ({
        outcome: "started",
        modelId: selected.modelId,
      }));
      const run = { token: {}, controller: new AbortController(), diagnostics };
      active = run;
      await executeRun({
        args,
        ctx,
        selected,
        run,
        diagnostics,
        cleanup: () => {
          if (active?.token === run.token) active = undefined;
        },
      });
    },
  });
}

function sessionIdReader(ctx: ExtensionCommandContext): (() => string) | undefined {
  try {
    if (!isDebugRegistryEnabled()) return undefined;
    return makeSessionIdReader(ctx.sessionManager);
  } catch {
    return undefined;
  }
}

function makeSessionIdReader(manager: ExtensionCommandContext["sessionManager"]): () => string {
  const getSessionId = manager.getSessionId;
  return () => getSessionId.call(manager);
}

function commandEntryRejection(
  ctx: ExtensionCommandContext,
  active: ActiveRun | undefined,
): { message: string; reasonCode: string } | undefined {
  if (active) {
    return {
      message: "A prompt improvement session is already active.",
      reasonCode: "duplicate_invocation",
    };
  }
  if (ctx.mode !== "tui" || !ctx.hasUI) {
    return {
      message: "Prompt improvement needs an idle TUI session with no pending work.",
      reasonCode: "not_tui",
    };
  }
  if (!ctx.isIdle()) {
    return {
      message: "Prompt improvement needs an idle TUI session with no pending work.",
      reasonCode: "agent_busy",
    };
  }
  if (ctx.hasPendingMessages()) {
    return {
      message: "Prompt improvement needs an idle TUI session with no pending work.",
      reasonCode: "pending_messages",
    };
  }
  return undefined;
}

function resolveConfiguredModel(
  ctx: ExtensionCommandContext,
): { selected: ConfiguredModel } | { selected?: never; reasonCode: string } {
  const config = loadPromptImproverConfig(ctx.cwd);
  if (config.model === "disabled") {
    ctx.ui.notify("Select an improver model in /supi-settings before you start.", "warning");
    return { reasonCode: "model_disabled" };
  }
  const model = resolvePromptImproverModel(ctx, config.model);
  if (!model) {
    ctx.ui.notify(
      "The configured improver model is not available in the current model scope.",
      "error",
    );
    return { reasonCode: "model_unavailable" };
  }
  return { selected: { model, modelId: config.model } };
}

async function executeRun(options: CommandRun): Promise<void> {
  const { args, ctx, selected, run, diagnostics, cleanup } = options;
  try {
    await runPromptImprover({
      args,
      ctx,
      model: selected.model,
      modelId: selected.modelId,
      controller: run.controller,
      diagnostics,
    });
  } catch (error) {
    diagnostics.record("run.failed", "error", "Prompt improvement workflow failed", () => ({
      outcome: "failed",
      reasonCode: "workflow_error",
      ...capturePromptImproverError(error),
    }));
    diagnostics.finish("failed", "workflow_error");
    if (!run.controller.signal.aborted) {
      ctx.ui.notify("Prompt improvement failed. The confirmed draft was kept.", "error");
    }
  } finally {
    cleanup();
  }
}
