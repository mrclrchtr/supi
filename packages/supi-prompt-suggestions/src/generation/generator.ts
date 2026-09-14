/** Async orchestration for prompt suggestion generation. */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { CONFIG_SECTION, DEFAULTS } from "../config/config.ts";
import {
  callSuggestionModel,
  GENERATION_TIMEOUT_MS,
  type SuggestionClientOutput,
} from "./client.ts";
import {
  classifySuggestionFailure,
  createSuggestionWarning,
  type SuggestionFailureKind,
  type SuggestionWarning,
  safeModelLabel,
  suggestionFailureSummary,
} from "./failure.ts";
import { resolveSuggestionModel } from "./model-resolution.ts";
import { normalizeSuggestionDetailed } from "./normalize.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type GenerationStatus =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "ready"; suggestion: string }
  | { kind: "error"; warning?: SuggestionWarning };

export interface SuggestionCallbacks {
  /** Called when generation status changes. */
  onStatus: (status: GenerationStatus) => void;
}

interface RunOptions {
  ctx: ExtensionContext;
  modelId: string;
  model: Model<Api> | undefined;
  tail: string;
  id: number;
  abort: AbortController;
  callbacks: SuggestionCallbacks;
}

type ModelCallOutcome =
  | { kind: "result"; result: SuggestionClientOutput }
  | { kind: "cancelled" }
  | { kind: "timeout" };

// ── Generator ──────────────────────────────────────────────────────────────

/**
 * Encapsulates the async suggestion generation lifecycle.
 *
 * Each instance owns cancellation, stale-result checks, and failure warning
 * suppression. Model authentication and provider routing stay under PI.
 */
export class SuggestionGenerator {
  private currentAbort: AbortController | null = null;
  private generationId = 0;
  private failureScope: string | undefined;
  private failureNotified = false;

  /**
   * Start suggestion generation from the last assistant text.
   *
   * Fire-and-forget — the caller does not await the returned promise.
   * Cancels any in-flight generation.
   */
  start(ctx: ExtensionContext, lastAssistantText: string, callbacks: SuggestionCallbacks): void {
    this.dismiss();

    const config = loadSupiConfig(CONFIG_SECTION, ctx.cwd, DEFAULTS);
    const scope = JSON.stringify([ctx.sessionManager.getSessionId(), config.model]);
    if (scope !== this.failureScope) {
      this.failureScope = scope;
      this.failureNotified = false;
    }
    if (config.model === "disabled") {
      this.#recordSkipped(ctx, "Prompt suggestion generation skipped: model is disabled");
      callbacks.onStatus({ kind: "idle" });
      return;
    }

    const text = lastAssistantText.trim();
    if (!text) {
      this.#recordSkipped(
        ctx,
        "Prompt suggestion generation skipped: no text in last assistant message",
      );
      callbacks.onStatus({ kind: "idle" });
      return;
    }

    const tail = text.slice(-8_000);
    const id = ++this.generationId;
    const abort = new AbortController();
    this.currentAbort = abort;
    const model = resolveSuggestionModel(ctx, config.model);

    callbacks.onStatus({ kind: "generating" });
    void this.#run({ ctx, modelId: config.model, model, tail, id, abort, callbacks });
  }

  /** Cancel in-flight generation and invalidate its result. */
  dismiss(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    this.generationId++;
  }

  /** Cancel generation and clear warning suppression for the active runtime. */
  reset(): void {
    this.dismiss();
    this.failureScope = undefined;
    this.failureNotified = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  async #run(opts: RunOptions): Promise<void> {
    const { ctx, tail, id, abort } = opts;

    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.start",
      message: "Prompt suggestion generation started",
      cwd: ctx.cwd,
      data: { modelId: safeModelLabel(opts.modelId), tailLength: tail.length },
    });

    try {
      const model = opts.model;
      if (!model) {
        this.#handleFailure("model-unavailable", opts);
        return;
      }
      if (id !== this.generationId || abort.signal.aborted) return;

      const response = await this.#callModelWithTimeout(opts, model);
      if (!response || id !== this.generationId || abort.signal.aborted) return;

      this.#handleResponse(response, opts);
    } catch (error) {
      if (id !== this.generationId || abort.signal.aborted) return;
      this.#handleFailure(classifySuggestionFailure(error), opts);
    } finally {
      if (this.currentAbort === abort) this.currentAbort = null;
    }
  }

  async #callModelWithTimeout(
    opts: RunOptions,
    model: Model<Api>,
  ): Promise<SuggestionClientOutput | null> {
    if (opts.abort.signal.aborted) return null;

    const requestAbort = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let removeCancellationListener: (() => void) | undefined;

    const timeout = new Promise<ModelCallOutcome>((resolve) => {
      timeoutId = setTimeout(() => {
        requestAbort.abort();
        resolve({ kind: "timeout" });
      }, GENERATION_TIMEOUT_MS);
    });

    const cancelled = new Promise<ModelCallOutcome>((resolve) => {
      const onAbort = () => {
        requestAbort.abort();
        resolve({ kind: "cancelled" });
      };
      opts.abort.signal.addEventListener("abort", onAbort, { once: true });
      removeCancellationListener = () => opts.abort.signal.removeEventListener("abort", onAbort);
      if (opts.abort.signal.aborted) onAbort();
    });

    const call = callSuggestionModel({
      ctx: opts.ctx,
      model,
      tail: opts.tail,
      signal: requestAbort.signal,
    }).then((result): ModelCallOutcome => ({ kind: "result", result }));

    try {
      const outcome = await Promise.race([call, timeout, cancelled]);
      if (outcome.kind === "cancelled") {
        this.#recordGenerationAbort(opts);
        return null;
      }
      if (outcome.kind === "timeout") {
        this.#recordGenerationTimeout(opts);
        return {
          ok: false,
          failure: { kind: "timeout", summary: suggestionFailureSummary("timeout") },
        };
      }
      return outcome.result;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      removeCancellationListener?.();
    }
  }

  #recordSkipped(ctx: ExtensionContext, message: string): void {
    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.skipped",
      message,
      cwd: ctx.cwd,
    });
  }

  #recordGenerationAbort(opts: RunOptions): void {
    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.aborted",
      message: "Prompt suggestion generation aborted",
      cwd: opts.ctx.cwd,
      data: { modelId: safeModelLabel(opts.modelId) },
    });
  }

  #recordGenerationTimeout(opts: RunOptions): void {
    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.timeout",
      message: "Prompt suggestion generation timed out",
      cwd: opts.ctx.cwd,
      data: { modelId: safeModelLabel(opts.modelId), timeoutMs: GENERATION_TIMEOUT_MS },
    });
  }

  #handleResponse(response: SuggestionClientOutput, opts: RunOptions): void {
    if (opts.id !== this.generationId) return;

    if (!response.ok) {
      this.#handleFailure(response.failure.kind, opts);
      return;
    }

    // A valid empty or NO_SUGGESTION response also clears warning suppression.
    this.failureNotified = false;

    const normalized = normalizeSuggestionDetailed(response.text);
    if (!normalized) {
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "debug",
        category: "generation.rejected",
        message: "Prompt suggestion rejected after normalization",
        cwd: opts.ctx.cwd,
        data: { rawLength: response.text.length },
      });
      opts.callbacks.onStatus({ kind: "idle" });
      return;
    }

    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.done",
      message: "Prompt suggestion ready",
      cwd: opts.ctx.cwd,
      data: {
        modelId: safeModelLabel(opts.modelId),
        rawLength: response.text.length,
        length: normalized.text.length,
        graphemeCount: normalized.graphemeCount,
        originalGraphemeCount: normalized.originalGraphemeCount,
        wasSafetyCapped: normalized.wasSafetyCapped,
      },
    });
    opts.callbacks.onStatus({ kind: "ready", suggestion: normalized.text });
  }

  #handleFailure(kind: SuggestionFailureKind, opts: RunOptions): void {
    if (opts.id !== this.generationId) return;

    const shouldNotify = !this.failureNotified;
    this.failureNotified = true;

    recordDebugEvent({
      source: "prompt-suggestions",
      level: "warning",
      category: "generation.failure",
      message: "Prompt suggestion generation failed",
      cwd: opts.ctx.cwd,
      data: {
        modelId: safeModelLabel(opts.modelId),
        failureKind: kind,
        notification: shouldNotify ? "shown" : "suppressed",
      },
    });

    if (shouldNotify) {
      opts.callbacks.onStatus({
        kind: "error",
        warning: createSuggestionWarning(opts.modelId, kind),
      });
      return;
    }
    opts.callbacks.onStatus({ kind: "error" });
  }
}
