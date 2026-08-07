import { describe, expect, it } from "vitest";
import { firstLineBashPreview, summarizeToolCall } from "../../src/tool/tool-summary.ts";

describe("summarizeToolCall", () => {
  it("returns name-only for unknown tools", () => {
    const result = summarizeToolCall("unknown_tool", { some: "arg" });
    expect(result.toolName).toBe("unknown_tool");
    expect(result.summary).toBeUndefined();
  });

  it("summarizes read with path", () => {
    const result = summarizeToolCall("read", { path: "/foo/bar.txt" });
    expect(result.summary).toBe("read /foo/bar.txt");
  });

  it("summarizes write with path", () => {
    const result = summarizeToolCall("write", { path: "/out.txt" });
    expect(result.summary).toBe("write /out.txt");
  });

  it("summarizes edit with path and edit count", () => {
    const result = summarizeToolCall("edit", { path: "/x.ts", edits: [{}, {}] });
    expect(result.summary).toBe("edit /x.ts (2 edits)");
  });

  it("summarizes edit with path and no edits", () => {
    const result = summarizeToolCall("edit", { path: "/x.ts" });
    expect(result.summary).toBe("edit /x.ts");
  });

  it("summarizes bash with a redacted first-line preview", () => {
    const result = summarizeToolCall("bash", { command: "ls -la" });
    expect(result.summary).toBe("bash ls -la");
    expect(result.bashPreview).toBe("ls -la");
  });

  it("summarizes code_* tools with query/file info", () => {
    expect(
      summarizeToolCall("code_inspect", { point: { file: "/src/app.ts", line: 1, character: 1 } })
        .summary,
    ).toBe("code_inspect /src/app.ts");
    expect(summarizeToolCall("code_find", { query: "myFunc", mode: "ast" }).summary).toBe(
      "code_find myFunc (ast)",
    );
    expect(summarizeToolCall("code_health", {}).summary).toBe("code_health");
  });
});

describe("firstLineBashPreview", () => {
  it("returns the first line of a command", () => {
    expect(firstLineBashPreview("echo hello\nrm -rf /")).toBe("echo hello");
  });

  it("collapses whitespace", () => {
    expect(firstLineBashPreview("echo   hello\tworld")).toBe("echo hello world");
  });

  it("redacts secret variable assignments", () => {
    const preview = firstLineBashPreview("TOKEN=abc123 npm install");
    expect(preview).toContain("[REDACTED]");
    expect(preview).not.toContain("abc123");
  });

  it("redacts secret flags with equals or space separators", () => {
    for (const command of [
      "curl --password=s3cr3t https://example.com",
      "curl --token s3cr3t https://example.com",
    ]) {
      const preview = firstLineBashPreview(command);
      expect(preview).toContain("[REDACTED]");
      expect(preview).not.toContain("s3cr3t");
    }
  });

  it("fully redacts quoted environment secrets", () => {
    const preview = firstLineBashPreview('GITHUB_TOKEN="two secret words" curl example.com');
    expect(preview).toContain("[REDACTED]");
    expect(preview).not.toContain("two secret words");
    expect(preview).not.toContain('words"');
  });

  it("caps at 120 characters", () => {
    const long = `echo ${"x".repeat(200)}`;
    const preview = firstLineBashPreview(long);
    expect(preview!.length).toBeLessThanOrEqual(120);
    expect(preview!.endsWith("…")).toBe(true);
  });

  it("returns undefined for empty input", () => {
    expect(firstLineBashPreview("")).toBeUndefined();
    expect(firstLineBashPreview("   ")).toBeUndefined();
  });
});
