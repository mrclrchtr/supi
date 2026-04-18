import { describe, expect, it } from "vitest";
import { wrapExtensionContext } from "../context-tag.ts";

describe("wrapExtensionContext", () => {
  it("wraps content with source only", () => {
    const result = wrapExtensionContext("supi-lsp", "Outstanding diagnostics:\n- foo.ts: 1 error");

    expect(result).toBe(
      '<extension-context source="supi-lsp">\nOutstanding diagnostics:\n- foo.ts: 1 error\n</extension-context>',
    );
  });

  it("wraps content with additional attributes", () => {
    const result = wrapExtensionContext("supi-claude-md", "file content", {
      file: "packages/foo/CLAUDE.md",
      turn: 5,
    });

    expect(result).toBe(
      // biome-ignore lint/security/noSecrets: XML tag fixture, not a secret
      '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">\nfile content\n</extension-context>',
    );
  });

  it("handles undefined attrs", () => {
    const result = wrapExtensionContext("supi-lsp", "hello", undefined);

    expect(result).toBe('<extension-context source="supi-lsp">\nhello\n</extension-context>');
  });

  it("coerces number attributes to strings", () => {
    const result = wrapExtensionContext("ext", "body", { count: 42 });

    expect(result).toContain('count="42"');
    // Verify the number was coerced to a string attribute
    // biome-ignore lint/security/noSecrets: XML tag fixture, not a secret
    expect(result).toBe('<extension-context source="ext" count="42">\nbody\n</extension-context>');
  });

  it("handles empty attrs object", () => {
    const result = wrapExtensionContext("ext", "body", {});

    // biome-ignore lint/security/noSecrets: XML tag fixture, not a secret
    expect(result).toBe('<extension-context source="ext">\nbody\n</extension-context>');
  });

  it("handles multiline content", () => {
    const content = "line 1\nline 2\nline 3";
    const result = wrapExtensionContext("ext", content);

    expect(result).toContain("line 1\nline 2\nline 3");
  });
});
