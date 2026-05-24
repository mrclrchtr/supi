import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { serializeSessionContext } from "../../src/history/collect.ts";

type ResolvedSessionMessage = SessionContext["messages"][number];

function makeUserMessage(text: string): ResolvedSessionMessage {
  return { role: "user", content: text } as unknown as ResolvedSessionMessage;
}

function makeAssistantMessage(text: string): ResolvedSessionMessage {
  return { role: "assistant", content: text } as unknown as ResolvedSessionMessage;
}

function makeCompactionSummary(summary: string): ResolvedSessionMessage {
  return {
    role: "compactionSummary",
    summary,
    tokensBefore: 1000,
    timestamp: Date.now(),
  } as unknown as ResolvedSessionMessage;
}

function makeBranchSummary(summary: string): ResolvedSessionMessage {
  return {
    role: "branchSummary",
    summary,
    fromId: "entry-0",
    timestamp: Date.now(),
  } as unknown as ResolvedSessionMessage;
}

function makeCustomMessage(text: string): ResolvedSessionMessage {
  return {
    role: "custom",
    content: text,
    customType: "supi-review",
  } as unknown as ResolvedSessionMessage;
}

describe("serializeSessionContext", () => {
  it("serializes user and assistant messages in order", () => {
    const result = serializeSessionContext([
      makeUserMessage("Refactor src/auth.ts"),
      makeAssistantMessage("I'll inspect the auth module."),
    ]);

    expect(result).toContain("[User]");
    expect(result).toContain("Refactor src/auth.ts");
    expect(result).toContain("[Assistant]");
    expect(result).toContain("I'll inspect the auth module.");
    // Verify order
    const userIdx = result.indexOf("Refactor src/auth.ts");
    const assistantIdx = result.indexOf("I'll inspect the auth module.");
    expect(userIdx).toBeLessThan(assistantIdx);
  });

  it("includes compaction summaries as labeled entries", () => {
    const result = serializeSessionContext([
      makeCompactionSummary("User wanted to preserve auth semantics."),
      makeUserMessage("Now add rate limiting."),
    ]);

    expect(result).toContain("[Compaction summary]");
    expect(result).toContain("User wanted to preserve auth semantics.");
    expect(result).toContain("[User]");
    expect(result).toContain("Now add rate limiting.");
  });

  it("includes branch summaries as labeled entries", () => {
    const result = serializeSessionContext([
      makeBranchSummary("Explored alternative middleware approach."),
      makeUserMessage("Let's go with the original design."),
    ]);

    expect(result).toContain("[Branch summary]");
    expect(result).toContain("Explored alternative middleware approach.");
  });

  it("includes custom messages as labeled entries", () => {
    const result = serializeSessionContext([makeCustomMessage("Review completed.")]);

    expect(result).toContain("[Custom]");
    expect(result).toContain("Review completed.");
  });

  it("returns empty string for empty input", () => {
    const result = serializeSessionContext([]);
    expect(result).toBe("");
  });

  it("normalizes whitespace in message text", () => {
    const result = serializeSessionContext([
      makeUserMessage("  Refactor   auth.ts  but  keep   API  "),
    ]);

    expect(result).toContain("Refactor auth.ts but keep API");
    expect(result).not.toContain("  ");
  });

  it("bounds output by truncating oldest messages when budget is exceeded", () => {
    const messages: ResolvedSessionMessage[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push(makeUserMessage(`Message number ${i} with some padding content.`));
    }

    const result = serializeSessionContext(messages, { maxChars: 500 });
    expect(result.length).toBeLessThanOrEqual(500);

    // At least the last few messages should be present
    const lastMsg = messages[messages.length - 1];
    const msgWithContent = lastMsg as unknown as { content?: unknown };
    const lastText = typeof msgWithContent.content === "string" ? msgWithContent.content : "";
    if (lastText) {
      expect(result).toContain(lastText.slice(0, 20));
    }
  });

  it("preserves compaction summaries even under tight budget by preferring them", () => {
    const messages: ResolvedSessionMessage[] = [makeCompactionSummary("Summary of prior work.")];

    for (let i = 0; i < 30; i++) {
      messages.push(makeUserMessage(`Message with some padding content number ${i}.`));
    }

    const result = serializeSessionContext(messages, { maxChars: 600 });
    expect(result).toContain("Summary of prior work.");
  });

  it("handles mixed content parts (array content)", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check the" },
        { type: "text", text: "implementation details." },
      ],
    } as unknown as ResolvedSessionMessage;

    const result = serializeSessionContext([message]);

    expect(result).toContain("Let me check the");
    expect(result).toContain("implementation details.");
  });
});
