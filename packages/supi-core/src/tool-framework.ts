// Shared tool framework for SuPi extensions.
//
// Provides a standard ToolSpec→PromptSurface→registerTool pipeline so
// individual packages do not duplicate spec interfaces, guidance derivation,
// registration loops, or common TypeBox parameter schemas.

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type TSchema, Type } from "typebox";
import { ProgressWidget, type WidgetProgress } from "./progress-widget.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimum contract for a SuPi tool definition. */
export interface SuiPiToolSpec {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: TSchema;
}

/** Derived prompt surface — what pi flattens into the system prompt. */
export interface SuiPiToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

// ---------------------------------------------------------------------------
// Guidance derivation
// ---------------------------------------------------------------------------

/**
 * Static derivation: copies spec fields into a prompt surface.
 *
 * Packages that need dynamic guidance (e.g. server-coverage injection) should
 * build their own surfaces, optionally starting from the output of this helper.
 */
export function derivePromptSurface(spec: SuiPiToolSpec): SuiPiToolPromptSurface {
  return {
    description: spec.description,
    promptSnippet: spec.promptSnippet,
    promptGuidelines: [...spec.promptGuidelines],
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/useMaxParams: matches pi ToolDefinition.execute signature
export type ToolExecuteFn = (
  toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  ctx: ExtensionContext,
) => Promise<AgentToolResult<Record<string, unknown>>>;

/**
 * Register a set of tools from specs + pre-derived surfaces.
 *
 * `createExecute` receives the spec and returns a pi-compatible execute
 * function.  This keeps execute-logic package-local while the framework owns
 * the declarative surface and registration boilerplate.
 */
export function registerSuiPiTools(
  pi: ExtensionAPI,
  specs: readonly SuiPiToolSpec[],
  surfaces: Record<string, SuiPiToolPromptSurface>,
  createExecute: (spec: SuiPiToolSpec) => ToolExecuteFn,
): void {
  for (const spec of specs) {
    const surface = surfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface?.description ?? spec.description,
      promptSnippet: surface?.promptSnippet ?? spec.promptSnippet,
      promptGuidelines: surface?.promptGuidelines ?? [...spec.promptGuidelines],
      parameters: spec.parameters,
      execute: createExecute(spec),
    });
  }
}

// ---------------------------------------------------------------------------
// Shared parameter builders
// ---------------------------------------------------------------------------

/** File path (relative or absolute). */
export const FileParam = Type.String({ description: "File path (relative or absolute)" });

/** 1-based line number. */
export const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });

/** 1-based character column (UTF-16). */
export const CharacterParam = Type.Number({
  description: "1-based column number (UTF-16)",
  minimum: 1,
});

/** Symbol name for discovery-based resolution. */
export const SymbolParam = Type.String({
  description: "Symbol name for discovery-based resolution",
});

/** Maximum results to return. */
export const MaxResultsParam = Type.Number({ description: "Maximum results to return" });

// ---------------------------------------------------------------------------
// Progress widget runner
// ---------------------------------------------------------------------------

/**
 * Run an async operation with a live TUI progress widget.
 *
 * Automatically manages:
 * - The {@link ProgressWidget} lifecycle
 * - `supi:working:start` / `supi:working:end` events for tab-spinner integration
 * - Abort signal handling
 * - Error catching (returns `null` on failure)
 *
 * Falls back to running without a widget when `ctx.hasUI` is false.
 *
 * @param pi - The extension API (for event emission).
 * @param ctx - The command context (for UI access and hasUI check).
 * @param title - The progress widget title.
 * @param runner - Async function that receives (signal, onProgress).
 * @returns The runner result, or `null` on cancel/error.
 */
export async function runWithProgressWidget<T>(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  title: string,
  runner: (signal: AbortSignal, onProgress: (p: WidgetProgress) => void) => Promise<T>,
): Promise<T | null> {
  if (!ctx.hasUI) {
    // No UI — run without progress widget but still emit working events
    pi.events.emit("supi:working:start", { source: "supi-core" });
    try {
      return await runner(new AbortController().signal, () => {});
    } catch {
      return null;
    } finally {
      pi.events.emit("supi:working:end", { source: "supi-core" });
    }
  }

  return ctx.ui.custom<T | null>((tui, theme, _kb, done) => {
    const widget = new ProgressWidget(tui, theme, title);
    let finished = false;

    const finish = (result: T | null) => {
      if (finished) return;
      finished = true;
      pi.events.emit("supi:working:end", { source: "supi-core" });
      widget.dispose();
      done(result);
    };

    widget.onAbort = () => {
      // Widget handles abort signal; runner resolves with cancel/error.
    };

    pi.events.emit("supi:working:start", { source: "supi-core" });
    runner(widget.signal, (progress) => widget.updateProgress(progress))
      .then((result) => finish(result))
      .catch(() => finish(null));

    return widget;
  });
}
