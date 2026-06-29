/**
 * Suggestion generator — async orchestration of prompt suggestion
 * generation with concurrency control.
 *
 * Manages the lifecycle: config check, model resolution, model call,
 * normalization, and callback dispatch. Uses an internal abort controller
 * and generation ID to cancel or discard stale results.
 *
 * @module
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { combineAbortSignals } from "@mrclrchtr/supi-core/abort-utils";
import { loadSectionConfig } from "@mrclrchtr/supi-core/config";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { CONFIG_SECTION, DEFAULTS } from "../config/config.ts";
import {
  callSuggestionModel,
  GENERATION_TIMEOUT_MS,
  type SuggestionClientOutput,
} from "./client.ts";
import { resolveSuggestionAuth } from "./model-resolution.ts";
import { normalizeSuggestion } from "./normalize.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type GenerationStatus =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "ready"; suggestion: string }
  | { kind: "error"; message: string };

export interface SuggestionCallbacks {
  /** Called when generation status changes. */
  onStatus: (status: GenerationStatus) => void;
}

interface RunOptions {
  ctx: ExtensionContext;
  modelId: string;
  tail: string;
  id: number;
  abort: AbortController;
  callbacks: SuggestionCallbacks;
}

// ── Generator ──────────────────────────────────────────────────────────────

/**
 * Encapsulates the async suggestion generation lifecycle.
 *
 * Manages concurrency via an internal abort controller and generation ID.
 * Instances are independent — tests can create fresh instances without
 * shared mutable state.
 */
export class SuggestionGenerator {
  private currentAbort: AbortController | null = null;
  private generationId = 0;

  /**
   * Start suggestion generation from the last assistant text.
   *
   * Fire-and-forget — the caller does not await the returned promise.
   * Cancels any in-flight generation.
   */
  start(ctx: ExtensionContext, lastAssistantText: string, callbacks: SuggestionCallbacks): void {
    // Cancel any in-flight generation
    this.dismiss();

    const config = loadSectionConfig(CONFIG_SECTION, ctx.cwd, DEFAULTS);
    if (config.model === "disabled") {
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "debug",
        category: "generation.skipped",
        message: "Prompt suggestion generation skipped: model is disabled",
        cwd: ctx.cwd,
      });
      callbacks.onStatus({ kind: "idle" });
      return;
    }

    const text = lastAssistantText.trim();
    if (!text) {
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "debug",
        category: "generation.skipped",
        message: "Prompt suggestion generation skipped: no text in last assistant message",
        cwd: ctx.cwd,
      });
      callbacks.onStatus({ kind: "idle" });
      return;
    }

    const tail = text.slice(-8_000);
    const id = ++this.generationId;
    const abort = new AbortController();
    this.currentAbort = abort;

    callbacks.onStatus({ kind: "generating" });

    // Fire-and-forget
    void this.#run({ ctx, modelId: config.model, tail, id, abort, callbacks });
  }

  /** Cancel in-flight generation and invalidate the current generation ID. */
  dismiss(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    this.generationId++;
  }

  // ── Private ──────────────────────────────────────────────────────────

  async #run(opts: RunOptions): Promise<void> {
    const { ctx, tail, id, abort, callbacks } = opts;

    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.start",
      message: "Prompt suggestion generation started",
      cwd: ctx.cwd,
      data: { modelId: opts.modelId, tailLength: tail.length },
    });

    try {
      const authResult = await resolveSuggestionAuth(ctx, opts.modelId);

      // Discard if generation was cancelled while resolving auth
      if (id !== this.generationId || abort.signal.aborted) return;

      if (authResult.kind === "error") {
        recordDebugEvent({
          source: "prompt-suggestions",
          level: "warning",
          category: "generation.auth-failure",
          message: authResult.message,
          cwd: ctx.cwd,
        });
        callbacks.onStatus({ kind: "error", message: authResult.message });
        return;
      }

      const { auth } = authResult;

      if (id !== this.generationId || abort.signal.aborted) return;

      const { signal: combinedSignal, cleanup: cleanupTimeout } = combineAbortSignals(
        abort,
        GENERATION_TIMEOUT_MS,
      );

      try {
        const response = await callSuggestionModel({
          model: auth.model,
          auth: { apiKey: auth.apiKey, headers: auth.headers },
          tail,
          signal: combinedSignal,
        });

        this.#handleResponse(response, id, ctx.cwd, callbacks, opts.modelId);
      } finally {
        cleanupTimeout();
      }
    } catch (err) {
      if (id !== this.generationId) return;
      const message = err instanceof Error ? err.message : String(err);
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "warning",
        category: "generation.error",
        message: `Prompt suggestion generation failed: ${message}`,
        cwd: ctx.cwd,
        data: { error: message },
      });
      callbacks.onStatus({ kind: "error", message });
    } finally {
      if (this.currentAbort === abort) {
        this.currentAbort = null;
      }
    }
  }

  // biome-ignore lint/complexity/useMaxParams: private method, params are orthogonal
  #handleResponse(
    response: SuggestionClientOutput,
    id: number,
    cwd: string,
    callbacks: SuggestionCallbacks,
    modelId: string,
  ): void {
    if (id !== this.generationId) return;

    if (!response.ok) {
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "warning",
        category: "generation.model-error",
        message: response.message,
        cwd,
        data: { modelId },
      });
      callbacks.onStatus({ kind: "error", message: response.message });
      return;
    }

    const normalized = normalizeSuggestion(response.text);
    if (!normalized) {
      recordDebugEvent({
        source: "prompt-suggestions",
        level: "debug",
        category: "generation.rejected",
        message: `Prompt suggestion rejected: empty after normalization (${response.text.length} raw chars)`,
        cwd,
        data: { rawLength: response.text.length },
      });
      callbacks.onStatus({ kind: "idle" });
      return;
    }

    recordDebugEvent({
      source: "prompt-suggestions",
      level: "debug",
      category: "generation.done",
      message: `Prompt suggestion ready: "${normalized}"`,
      cwd,
      data: { suggestion: normalized, length: normalized.length },
    });
    callbacks.onStatus({ kind: "ready", suggestion: normalized });
  }
}
