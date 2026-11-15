import type { ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";

/** Renderers the TUI resolved for one tool name, read fresh on each lookup. */
export interface ObservedToolRenderers {
  /** `undefined` when Pi draws the tool with its generic fallback. */
  renderers: ToolRenderers | undefined;
}

/**
 * Records how the TUI resolves renderers per tool name, without changing them.
 *
 * Register {@link ToolRendererObserver.resolver} with `pi.registerToolRenderer()`. It returns
 * `next()` unchanged and keeps that `next` per tool name. A later lookup calls it again, so it
 * sees later resolvers, the registered tool, and Pi's built-in renderers as they are now
 * (for example after `/reload`). Resolvers of extensions loaded before this one are not seen.
 */
export interface ToolRendererObserver {
  resolver: ToolRendererResolver;
  /** Renderers for a tool the TUI has drawn in this session, or `undefined` if it never did. */
  lookup(toolName: string): ObservedToolRenderers | undefined;
}

/** Create an observer with an empty record; one per extension load. */
export function createToolRendererObserver(): ToolRendererObserver {
  const resolvers = new Map<string, () => ToolRenderers | undefined>();
  return {
    resolver: (toolName, next) => {
      resolvers.set(toolName, next);
      return next();
    },
    lookup: (toolName) => {
      const next = resolvers.get(toolName);
      return next ? { renderers: next() } : undefined;
    },
  };
}
