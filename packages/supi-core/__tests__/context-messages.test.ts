import { describe, expect, it } from "vitest";
import {
  type ContextMessageLike,
  findLastUserMessageIndex,
  getContextToken,
  getPromptContent,
  pruneAndReorderContextMessages,
  restorePromptContent,
} from "../src/context-messages.ts";

describe("getContextToken", () => {
  it("returns token string from valid details", () => {
    expect(getContextToken({ contextToken: "abc-123" })).toBe("abc-123");
  });

  it("returns null when token is missing", () => {
    expect(getContextToken({ otherField: 42 })).toBeNull();
  });

  it("returns null when details is null", () => {
    expect(getContextToken(null)).toBeNull();
  });

  it("returns null when details is undefined", () => {
    expect(getContextToken(undefined)).toBeNull();
  });

  it("returns null when contextToken is not a string", () => {
    expect(getContextToken({ contextToken: 123 })).toBeNull();
  });
});

describe("findLastUserMessageIndex", () => {
  it("returns index of last user message", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      { role: "assistant" },
      { role: "user" },
      { role: "assistant" },
    ];
    expect(findLastUserMessageIndex(messages)).toBe(2);
  });

  it("returns -1 when no user messages exist", () => {
    const messages: ContextMessageLike[] = [{ role: "assistant" }, { role: "assistant" }];
    expect(findLastUserMessageIndex(messages)).toBe(-1);
  });

  it("returns -1 for empty array", () => {
    expect(findLastUserMessageIndex([])).toBe(-1);
  });

  it("returns 0 when only one user message at start", () => {
    const messages: ContextMessageLike[] = [{ role: "user" }, { role: "assistant" }];
    expect(findLastUserMessageIndex(messages)).toBe(0);
  });
});

describe("pruneAndReorderContextMessages", () => {
  it("removes all messages of customType when activeToken is null", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      { role: "assistant", customType: "lsp-context", details: { contextToken: "old-1" } },
      { role: "assistant" },
      { role: "assistant", customType: "lsp-context", details: { contextToken: "old-2" } },
    ];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", null);
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.customType !== "lsp-context")).toBe(true);
  });

  it("keeps only the active message matching token", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      {
        role: "assistant",
        customType: "supi-claude-md-refresh",
        details: { contextToken: "old-1" },
      },
      { role: "user" },
      {
        role: "assistant",
        customType: "supi-claude-md-refresh",
        details: { contextToken: "active-1" },
      },
    ];

    const result = pruneAndReorderContextMessages(messages, "supi-claude-md-refresh", "active-1");
    expect(result).toHaveLength(3);
    expect(result.filter((m) => m.customType === "supi-claude-md-refresh")).toHaveLength(1);
  });

  it("reorders active message before last user message", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      { role: "assistant", customType: "lsp-context", details: { contextToken: "active-1" } },
      { role: "user" },
    ];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", "active-1");
    expect(result).toHaveLength(3);
    expect(result[1]?.customType).toBe("lsp-context");
    expect(result[2]?.role).toBe("user");
  });

  it("does not reorder when already before last user message", () => {
    const messages: ContextMessageLike[] = [
      { role: "assistant", customType: "lsp-context", details: { contextToken: "active-1" } },
      { role: "user" },
    ];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", "active-1");
    expect(result).toHaveLength(2);
    expect(result[0]?.customType).toBe("lsp-context");
  });

  it("returns unchanged array when no messages of customType exist", () => {
    const messages: ContextMessageLike[] = [{ role: "user" }, { role: "assistant" }];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", "token-1");
    expect(result).toEqual(messages);
  });

  it("removes all matching customType messages when no active token matches", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      { role: "assistant", customType: "lsp-context", details: { contextToken: "old" } },
      { role: "assistant" },
    ];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", "different-token");
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.customType !== "lsp-context")).toBe(true);
  });

  it("does not affect messages of other customTypes", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      { role: "assistant", customType: "other-type", details: { contextToken: "keep" } },
      { role: "assistant", customType: "lsp-context", details: { contextToken: "old" } },
      { role: "user" },
    ];

    const result = pruneAndReorderContextMessages(messages, "lsp-context", null);
    expect(result).toHaveLength(3);
    expect(result.some((m) => m.customType === "other-type")).toBe(true);
    expect(result.some((m) => m.customType === "lsp-context")).toBe(false);
  });
});

describe("getPromptContent", () => {
  it("returns promptContent string from valid details", () => {
    expect(getPromptContent({ promptContent: "<xml>data</xml>" })).toBe("<xml>data</xml>");
  });

  it("returns null when promptContent is missing", () => {
    expect(getPromptContent({ otherField: 42 })).toBeNull();
  });

  it("returns null when details is null", () => {
    expect(getPromptContent(null)).toBeNull();
  });

  it("returns null when promptContent is not a string", () => {
    expect(getPromptContent({ promptContent: 123 })).toBeNull();
  });
});

describe("restorePromptContent", () => {
  it("restores promptContent onto the matching message", () => {
    const messages: ContextMessageLike[] = [
      { role: "user" },
      {
        role: "custom",
        customType: "lsp-context",
        content: "display text",
        details: { contextToken: "active-1", promptContent: "<xml>raw</xml>" },
      },
      { role: "user" },
    ];

    const result = restorePromptContent(messages, "lsp-context", "active-1");
    expect(result[1]?.content).toBe("<xml>raw</xml>");
  });

  it("returns original array when activeToken is null", () => {
    const messages: ContextMessageLike[] = [{ role: "user" }];
    expect(restorePromptContent(messages, "lsp-context", null)).toBe(messages);
  });

  it("returns original array when no matching message found", () => {
    const messages: ContextMessageLike[] = [{ role: "custom", customType: "other", content: "x" }];
    expect(restorePromptContent(messages, "lsp-context", "active-1")).toBe(messages);
  });

  it("returns original array when promptContent is missing", () => {
    const messages: ContextMessageLike[] = [
      {
        role: "custom",
        customType: "lsp-context",
        content: "display",
        details: { contextToken: "active-1" },
      },
    ];
    expect(restorePromptContent(messages, "lsp-context", "active-1")).toBe(messages);
  });

  it("returns original array when content already matches promptContent", () => {
    const messages: ContextMessageLike[] = [
      {
        role: "custom",
        customType: "lsp-context",
        content: "same",
        details: { contextToken: "active-1", promptContent: "same" },
      },
    ];
    expect(restorePromptContent(messages, "lsp-context", "active-1")).toBe(messages);
  });

  it("does not mutate the original array", () => {
    const messages: ContextMessageLike[] = [
      {
        role: "custom",
        customType: "lsp-context",
        content: "display",
        details: { contextToken: "active-1", promptContent: "<raw>" },
      },
    ];

    const result = restorePromptContent(messages, "lsp-context", "active-1");
    expect(result).not.toBe(messages);
    expect(messages[0]?.content).toBe("display");
    expect(result[0]?.content).toBe("<raw>");
  });
});
