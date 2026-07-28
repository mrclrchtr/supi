import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { collectChildUsage } from "../../src/tool/child-usage.ts";

const first = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 1,
  reasoning: 3,
  totalTokens: 18,
  cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
};

const second = {
  input: 20,
  output: 7,
  cacheRead: 4,
  cacheWrite: 2,
  cacheWrite1h: 1,
  totalTokens: 33,
  cost: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, total: 14 },
};

describe("collectChildUsage", () => {
  it("aggregates every assistant turn without counting non-assistant usage", () => {
    const session = {
      messages: [
        { role: "assistant", usage: first },
        { role: "toolResult", usage: second },
        { role: "assistant", usage: second },
      ],
    } as unknown as AgentSession;

    expect(collectChildUsage(session)).toEqual({
      input: 30,
      output: 12,
      cacheRead: 6,
      cacheWrite: 3,
      cacheWrite1h: 1,
      reasoning: 3,
      totalTokens: 51,
      cost: { input: 3, output: 5, cacheRead: 7, cacheWrite: 9, total: 24 },
    });
  });

  it("omits usage when the child transcript is unavailable", () => {
    const session = {
      get messages() {
        throw new Error("unavailable");
      },
    } as unknown as AgentSession;

    expect(collectChildUsage(session)).toBeUndefined();
  });
});
