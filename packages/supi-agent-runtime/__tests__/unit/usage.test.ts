import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { collectAgentRunUsage } from "../../src/api.ts";

const usage = (value: number) => ({
  input: value,
  output: value,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: value,
  cost: { input: value, output: value, cacheRead: 0, cacheWrite: 0, total: value },
});

describe("collectAgentRunUsage", () => {
  it("returns no usage when the session transcript getter throws", () => {
    const session = {
      get messages() {
        throw new Error("private transcript error");
      },
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        cost: 0,
      }),
    } as unknown as AgentSession;

    expect(collectAgentRunUsage(session)).toBeUndefined();
  });

  it("combines observed model calls with persisted tool-result usage", () => {
    const session = {
      sessionManager: {
        getEntries: () => [
          { type: "message", message: { role: "assistant", usage: usage(1) } },
          { type: "message", message: { role: "toolResult", usage: usage(2) } },
          { type: "compaction", usage: usage(3) },
        ],
      },
      messages: [],
    } as unknown as AgentSession;

    expect(collectAgentRunUsage(session, [usage(1), usage(3), usage(4)])?.input).toBe(10);
  });

  it("counts every usage-bearing session entry exactly once", () => {
    const session = {
      sessionManager: {
        getEntries: () => [
          { type: "message", message: { role: "assistant", usage: usage(1) } },
          { type: "message", message: { role: "toolResult", usage: usage(2) } },
          { type: "compaction", usage: usage(3) },
          { type: "branch_summary", usage: usage(4) },
        ],
      },
      messages: [],
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        cost: 0,
      }),
    } as unknown as AgentSession;

    expect(collectAgentRunUsage(session)).toEqual({
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 10,
      cost: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, total: 10 },
    });
  });
});
