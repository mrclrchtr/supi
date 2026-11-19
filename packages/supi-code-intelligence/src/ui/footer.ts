/**
 * LSP footer contribution for code-intelligence.
 *
 * Shows workspace LSP state on the right side of the footer path line, for
 * example `λ 3✓ ◫43` (three ready routes, 43 tracked files).
 *
 * The text comes from the controller's latest published lifecycle snapshot.
 * Rendering never queries the runtime, because route status can require
 * file-system probes and the footer renders often. The same text is published
 * through Pi's status API so the built-in footer and other custom footers
 * show it too; the SuPi footer skips that same-key status.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  FOOTER_INVALIDATE_EVENT,
  type FooterColor,
  type FooterGlyphMode,
  type FooterRenderContext,
  footerContributions,
} from "@mrclrchtr/supi-core/footer-registry";
import type { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import {
  classifyProjectServerRoute,
  type ProjectServerRouteState,
} from "../analysis/health/server-status.ts";
import { LSP_STATE_CHANGE_EVENT, type LspAdapterState } from "../substrate/lsp/state.ts";

type CountedState = Exclude<ProjectServerRouteState, "loading">;

interface LspFooterGlyphs {
  label: string;
  /** Tracked-file prefix, written directly before the count. */
  files: string;
  states: Record<CountedState, string>;
}

const UNICODE_GLYPHS: LspFooterGlyphs = {
  label: "λ",
  files: "◫",
  states: { ready: "✓", starting: "⟳", recovering: "↻", error: "✗", unavailable: "⊘" },
};

const GLYPHS: Record<FooterGlyphMode, LspFooterGlyphs> = {
  // U+F0DCB: Material Design file outline.
  nerd: { ...UNICODE_GLYPHS, files: "\u{F0DCB}" },
  unicode: UNICODE_GLYPHS,
  ascii: {
    label: "lsp",
    files: "f",
    states: { ready: "ok", starting: "~", recovering: "r", error: "x", unavailable: "-" },
  },
};

/** Display order and color of each counted route state. `loading` counts as starting. */
const ROUTE_PARTS: ReadonlyArray<{ state: CountedState; color: FooterColor }> = [
  { state: "ready", color: "success" },
  { state: "starting", color: "accent" },
  { state: "recovering", color: "warning" },
  { state: "error", color: "error" },
  { state: "unavailable", color: "warning" },
];

const plainContext: FooterRenderContext = { style: (_color, text) => text, glyphMode: "unicode" };

type LspFooterController = Pick<
  LspRuntimeController,
  "kind" | "latestLifecycleTransition" | "getConfigurationError"
>;

/**
 * Build the LSP status text, for example `λ 3✓ 1⟳ 1✗ ◫2`.
 *
 * A controller that could not start shows `✗ config` for a configuration error
 * and `✗ unavailable` otherwise. A disabled or absent controller shows nothing.
 */
export function buildLspStatusText(
  lspState: LspAdapterState,
  ctx: FooterRenderContext = plainContext,
): string | undefined {
  const controller = lspState.controller as LspFooterController | null;
  if (!controller) return undefined;
  const { style } = ctx;
  const glyphs = GLYPHS[ctx.glyphMode];
  const label = style("dim", glyphs.label);
  const failure = glyphs.states.error;

  if (controller.kind === "unavailable") {
    const cause = controller.getConfigurationError() ? "config" : "unavailable";
    return `${label} ${style("error", `${failure} ${cause}`)}`;
  }
  if (controller.kind !== "ready" && controller.kind !== "pending") return undefined;

  const servers = controller.latestLifecycleTransition?.projectServers ?? [];
  const counts = countRouteStates(servers);
  const trackedFiles = servers.reduce((sum, server) => sum + server.openFiles.length, 0);
  if (counts.size === 0 && trackedFiles === 0) return undefined;

  const parts = [label];
  for (const { state, color } of ROUTE_PARTS) {
    const count = counts.get(state);
    if (count) parts.push(style(color, `${count}${glyphs.states[state]}`));
  }
  if (trackedFiles > 0) parts.push(style("dim", `${glyphs.files}${trackedFiles}`));
  return parts.join(" ");
}

function countRouteStates(
  servers: readonly Parameters<typeof classifyProjectServerRoute>[0][],
): Map<CountedState, number> {
  const counts = new Map<CountedState, number>();
  for (const server of servers) {
    const state = classifyProjectServerRoute(server);
    // A route that still loads its projects answers queries but is not done yet.
    const counted = state === "loading" ? "starting" : state;
    counts.set(counted, (counts.get(counted) ?? 0) + 1);
  }
  return counts;
}

// ── Footer contribution ─────────────────────────────────────────────────

const FOOTER_KEY = "lsp-status";

/** Register the LSP footer contribution and its Pi status fallback. */
export function registerLspFooterContribution(
  pi: ExtensionAPI,
  lspState: LspAdapterState,
): {
  dispose: () => void;
} {
  let statusUi: ExtensionContext["ui"] | undefined;

  footerContributions.register({
    key: FOOTER_KEY,
    placement: "path-end",
    priority: 100,
    render: (ctx) => buildLspStatusText(lspState, ctx) ?? "",
  });

  const publishStatus = () => {
    if (!statusUi) return;
    const theme = statusUi.theme;
    const text = buildLspStatusText(lspState, {
      style: (color, value) => theme.fg(color, value),
      glyphMode: "unicode",
    });
    try {
      statusUi.setStatus(FOOTER_KEY, text);
    } catch {
      // Pi may be shutting down while the status changes.
    }
  };

  pi.on("session_start", (_event, ctx) => {
    statusUi = ctx.mode === "tui" ? ctx.ui : undefined;
    publishStatus();
  });
  pi.on("session_shutdown", () => {
    statusUi?.setStatus(FOOTER_KEY, undefined);
    statusUi = undefined;
  });

  // Re-render when the runtime publishes a new snapshot.
  const handler = () => {
    publishStatus();
    pi.events.emit(FOOTER_INVALIDATE_EVENT, {});
  };
  lspState.stateChanges.addEventListener(LSP_STATE_CHANGE_EVENT, handler);

  return {
    dispose() {
      lspState.stateChanges.removeEventListener(LSP_STATE_CHANGE_EVENT, handler);
      unregisterLspFooterContribution();
    },
  };
}

/** Remove the LSP footer contribution. */
export function unregisterLspFooterContribution(): void {
  footerContributions.unregister(FOOTER_KEY);
}
