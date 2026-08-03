import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage, AgentRunSessionView } from "./types.ts";

/** Build the narrowed, control-free view supplied to runtime callbacks. */
export function createAgentRunSessionView(session: AgentSession, cwd: string): AgentRunSessionView {
  const view: AgentRunSessionView = {
    get cwd() {
      return cwd;
    },
    get model() {
      return snapshot(session.model);
    },
    get thinkingLevel() {
      return session.thinkingLevel;
    },
    get isStreaming() {
      return session.isStreaming;
    },
    get messages() {
      return snapshot(session.messages) as unknown as readonly AgentRunMessage[];
    },
    getActiveToolNames: () => {
      try {
        return Object.freeze([...session.getActiveToolNames()]);
      } catch {
        return Object.freeze([] as string[]);
      }
    },
    getSessionStats: () => snapshot(session.getSessionStats()),
    getLastAssistantText: () => session.getLastAssistantText(),
    subscribe: (listener) =>
      session.subscribe((event) => {
        try {
          listener(snapshot(event));
        } catch {
          // Observer failures must not change Agent Run lifecycle semantics.
        }
      }),
  };
  return Object.freeze(view);
}

function snapshot<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const clone = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") return current;
    const existing = seen.get(current);
    if (existing) return existing;
    if (Array.isArray(current)) {
      const array: unknown[] = [];
      seen.set(current, array);
      for (const item of current) array.push(clone(item));
      return Object.freeze(array);
    }

    const object: Record<string, unknown> = {};
    seen.set(current, object);
    for (const [key, item] of Object.entries(current)) object[key] = clone(item);
    return Object.freeze(object);
  };

  return clone(value) as T;
}
