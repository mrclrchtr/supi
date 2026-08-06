import type { AgentSession, SessionStats } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage, AgentRunSessionView } from "./types.ts";

const viewDeactivators = new WeakMap<object, () => void>();

/** Build the narrowed, control-free view supplied to runtime callbacks. */
export function createAgentRunSessionView(session: AgentSession, cwd: string): AgentRunSessionView {
  let active = true;
  let activeSession: AgentSession | undefined = session;
  const subscriptions = new Set<() => void>();
  const inactiveStats = Object.freeze({
    sessionFile: undefined,
    sessionId: "",
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 0,
    tokens: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }),
    cost: 0,
    contextUsage: undefined,
  }) as SessionStats;
  const view: AgentRunSessionView = {
    get cwd() {
      return cwd;
    },
    get model() {
      const current = activeSession;
      return active && current ? snapshot(current.model) : undefined;
    },
    get thinkingLevel() {
      const current = activeSession;
      return active && current ? current.thinkingLevel : "off";
    },
    get isStreaming() {
      const current = activeSession;
      return active && current ? current.isStreaming : false;
    },
    get messages() {
      const current = activeSession;
      return active && current
        ? (snapshot(current.messages) as unknown as readonly AgentRunMessage[])
        : Object.freeze([] as readonly AgentRunMessage[]);
    },
    getActiveToolNames: () => {
      const current = activeSession;
      if (!active || !current) return Object.freeze([] as string[]);
      try {
        return Object.freeze([...current.getActiveToolNames()]);
      } catch {
        return Object.freeze([] as string[]);
      }
    },
    getSessionStats: () => {
      const current = activeSession;
      return active && current ? snapshot(current.getSessionStats()) : inactiveStats;
    },
    getLastAssistantText: () => {
      const current = activeSession;
      return active && current ? current.getLastAssistantText() : undefined;
    },
    subscribe: (listener) => {
      const current = activeSession;
      if (!active || !current) return () => undefined;
      let sessionUnsubscribe: (() => void) | undefined;
      const cleanup = (): void => {
        subscriptions.delete(cleanup);
        const unsubscribe = sessionUnsubscribe;
        sessionUnsubscribe = undefined;
        unsubscribe?.();
      };
      sessionUnsubscribe = current.subscribe((event) => {
        if (!active || activeSession === undefined) return;
        try {
          listener(snapshot(event));
        } catch {
          // Observer failures must not change Agent Run lifecycle semantics.
        }
      });
      subscriptions.add(cleanup);
      return cleanup;
    },
  };
  viewDeactivators.set(view, () => {
    if (!active) return;
    active = false;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
    activeSession = undefined;
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
