import type { AgentSession, SessionStats } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage, AgentRunSessionView } from "./types.ts";

const viewDeactivators = new WeakMap<object, () => void>();

/** Build the narrowed, control-free view supplied to runtime callbacks. */
export function createAgentRunSessionView(session: AgentSession, cwd: string): AgentRunSessionView {
  let active = true;
  const subscriptions = new Set<() => void>();
  const inactiveStats = Object.freeze({
    sessionFile: undefined,
    sessionId: "",
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    contextUsage: undefined,
  }) as SessionStats;
  const view: AgentRunSessionView = {
    get cwd() {
      return cwd;
    },
    get model() {
      return active ? snapshot(session.model) : undefined;
    },
    get thinkingLevel() {
      return active ? session.thinkingLevel : "off";
    },
    get isStreaming() {
      return active && session.isStreaming;
    },
    get messages() {
      return active
        ? (snapshot(session.messages) as unknown as readonly AgentRunMessage[])
        : Object.freeze([] as readonly AgentRunMessage[]);
    },
    getActiveToolNames: () => {
      if (!active) return Object.freeze([] as string[]);
      try {
        return Object.freeze([...session.getActiveToolNames()]);
      } catch {
        return Object.freeze([] as string[]);
      }
    },
    getSessionStats: () => (active ? snapshot(session.getSessionStats()) : inactiveStats),
    getLastAssistantText: () => (active ? session.getLastAssistantText() : undefined),
    subscribe: (listener) => {
      if (!active) return () => undefined;
      const unsubscribe = session.subscribe((event) => {
        if (!active) return;
        try {
          listener(snapshot(event));
        } catch {
          // Observer failures must not change Agent Run lifecycle semantics.
        }
      });
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
  };
  viewDeactivators.set(view, () => {
    if (!active) return;
    active = false;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
  });
  return Object.freeze(view);
}

/** Disable a callback view before its owned session is disposed. */
export function deactivateAgentRunSessionView(view: AgentRunSessionView): void {
  viewDeactivators.get(view)?.();
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
