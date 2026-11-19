// Shared footer contribution registry for SuPi extensions.
//
// Extensions register text chunks with a placement hint. The custom footer in
// supi-extras reads these contributions and renders them alongside the
// built-in metrics. Extensions can use PI's status API with the same key as a
// fallback when the custom footer is not installed.

import { createRegistry } from "./registry-utils.ts";

/** Event emitted when a dynamic footer contribution needs a new render. */
export const FOOTER_INVALIDATE_EVENT = "supi:footer:invalidate";

/**
 * Where the contribution should appear in the footer.
 *
 * - `path-end`: right side of the workspace line (path and Git), for workspace state
 * - `stats`: inside the cache section of the session line
 * - `stats-end`: own sections after context usage on the session line
 * - `model-start`: right side of the session line, before the model name
 * - `status`: extension status line below the footer
 */
export type FooterPlacement = "path-end" | "stats" | "stats-end" | "model-start" | "status";

/** Icon set selected by the footer `icons` setting. */
export type FooterGlyphMode = "nerd" | "unicode" | "ascii";

/**
 * Theme color names accepted by {@link FooterRenderContext.style}.
 * Matches the Pi `ThemeColor` names SuPi contributions use.
 */
export type FooterColor = "accent" | "dim" | "muted" | "text" | "success" | "warning" | "error";

/** Render inputs supplied by the custom footer. */
export interface FooterRenderContext {
  /** Apply a theme color. */
  style: (color: FooterColor, text: string) => string;
  /** Resolved icon mode; contributions choose matching glyphs. */
  glyphMode: FooterGlyphMode;
}

/** A single footer contribution registered by an extension. */
export interface FooterContribution {
  /**
   * Unique key for this contribution. Re-registering with the same key replaces it.
   * A same-key Pi status is treated as this contribution's built-in-footer fallback.
   */
  key: string;
  /** Which footer area this belongs to. */
  placement: FooterPlacement;
  /**
   * Sort order within the placement (lower values render further left). Default: 100.
   * Priority 0 is reserved for the turn cache-hit part so it stays adjacent to CH.
   */
  priority?: number;
  /**
   * Return the text for this contribution; empty hides it. Called on every render.
   * Callers without a footer context (for example tests) may omit `ctx`.
   */
  render: (ctx?: FooterRenderContext) => string;
}

const registry = createRegistry<FooterContribution>("footer-contributions");

function sortByPriority(a: FooterContribution, b: FooterContribution): number {
  return (a.priority ?? 100) - (b.priority ?? 100);
}

export const footerContributions = {
  /** Register or replace a footer contribution. */
  register(contribution: FooterContribution): void {
    registry.register(contribution.key, contribution);
  },

  /** Remove a contribution (e.g. on session_shutdown or when disabled). */
  unregister(key: string): void {
    registry.unregister(key);
  },

  /** Get contributions for a specific placement, sorted by priority. */
  getByPlacement(placement: FooterPlacement): FooterContribution[] {
    return registry
      .getAll()
      .filter((c) => c.placement === placement)
      .sort(sortByPriority);
  },

  /** Get every registered contribution regardless of placement. */
  getAll(): FooterContribution[] {
    return registry.getAll();
  },

  /** Remove all contributions (primarily for tests). */
  clear(): void {
    registry.clear();
  },
};
