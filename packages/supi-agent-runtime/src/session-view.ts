import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage, AgentRunSessionView } from "./types.ts";

/** Build the narrowed, control-free view supplied to runtime callbacks. */
export function createAgentRunSessionView(session: AgentSession, cwd: string): AgentRunSessionView {
  return {
    get cwd() {
      return cwd;
    },
    get model() {
      return session.model;
    },
    get thinkingLevel() {
      return session.thinkingLevel;
    },
    get isStreaming() {
      return session.isStreaming;
    },
    get messages() {
      return session.messages.slice() as unknown as AgentRunMessage[];
    },
    getActiveToolNames: () => {
      try {
        return [...session.getActiveToolNames()];
      } catch {
        return [];
      }
    },
    getSessionStats: () => session.getSessionStats(),
    getLastAssistantText: () => session.getLastAssistantText(),
    subscribe: (listener) =>
      session.subscribe((event) => {
        try {
          listener(event);
        } catch {
          // Observer failures must not change Agent Run lifecycle semantics.
        }
      }),
  };
}
