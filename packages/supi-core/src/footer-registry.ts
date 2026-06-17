// Shared footer contribution registry for SuPi extensions.
//
// Extensions register pre-styled text chunks with a placement hint
// ("stats" for the metrics line, "status" for the extension status line).
// The custom footer in supi-extras (or PI's built-in footer) reads these
// contributions and renders them alongside the built-in metrics.

import { createRegistry } from "./registry-utils.ts";

/** Where the contribution should appear in the footer. */
export type FooterPlacement = "stats" | "status";

/** A single footer contribution registered by an extension. */
export interface FooterContribution {
  /** Unique key for this contribution. Re-registering with the same key replaces it. */
  key: string;
  /** Which footer line this belongs on. */
  placement: FooterPlacement;
  /**
   * Sort order within the placement (lower values render further left). Default: 100.
   * Priority 0 is reserved for the turn cache-hit part so it stays adjacent to CH.
   */
  priority?: number;
  /** Return the pre-styled text for this contribution. Called on every render. */
  render: () => string;
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

  /** Remove all contributions (primarily for tests). */
  clear(): void {
    registry.clear();
  },
};
