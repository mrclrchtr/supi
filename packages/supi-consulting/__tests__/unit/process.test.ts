import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAntigravityEnvironment } from "../../src/agents/antigravity/process/environment.ts";
import { AntigravityEventAccumulator } from "../../src/agents/antigravity/process/events.ts";
import {
  BoundedLineParser,
  BoundedStderrCapture,
  StreamLimitError,
} from "../../src/agents/antigravity/process/ndjson.ts";

const answer = {
  answer: "A bounded answer.",
  sources: [{ title: "Node", url: "https://nodejs.org/api/child_process.html" }],
  workspaceEvidence: [{ path: "src/index.ts", summary: "The fixture has a cancellation helper." }],
};

describe("bounded Antigravity streams", () => {
  it("keeps only the approved environment and forces the isolated home", () => {
    const environment = buildAntigravityEnvironment("/isolated", {
      PATH: "/bin",
      LANG: "C",
      PI_CODING_AGENT_DIR: "/user-agent",
      GOOGLE_API_KEY: "secret",
    });
    expect(environment).toEqual({
      PATH: "/bin",
      LANG: "C",
      HOME: "/isolated",
      AGY_CLI_DISABLE_AUTO_UPDATE: "true",
    });
  });

  it("parses lines across chunks and handles CRLF", () => {
    const parser = new BoundedLineParser({ maxLineBytes: 20, maxTotalBytes: 100 });
    const lines: string[] = [];
    parser.feed(Buffer.from('{"one":1}\r\n{"two":'), (line) => lines.push(line));
    parser.feed(Buffer.from("2}\n"), (line) => lines.push(line));
    parser.finish((line) => lines.push(line));
    expect(lines).toEqual(['{"one":1}', '{"two":2}']);
  });

  it("rejects an oversized line before retaining it", () => {
    const parser = new BoundedLineParser({ maxLineBytes: 4, maxTotalBytes: 100 });
    expect(() => parser.feed(Buffer.from("12345"), () => undefined)).toThrow(StreamLimitError);
  });

  it("bounds retained stderr", () => {
    const stderr = new BoundedStderrCapture(5);
    stderr.feed(Buffer.from("abcdef"));
    expect(stderr.text()).toBe("abcde\n[stderr truncated]");
  });

  it("keeps only successful tool facts and classifies web and workspace activity", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ type: "system", session_id: "conversation-1" });
    accumulator.consume({
      type: "tool_use",
      id: "web-1",
      name: "search_web",
      input: { url: "https://nodejs.org/api/child_process.html" },
    });
    accumulator.consume({
      type: "tool_result",
      tool_use_id: "web-1",
      status: "success",
      content: [{ type: "text", text: "The file says permission denied." }],
    });
    accumulator.consume({
      type: "tool_use",
      id: "file-1",
      name: "read_file",
      input: { path: "./src/index.ts" },
    });
    accumulator.consume({ type: "tool_result", tool_use_id: "file-1", status: "success" });
    accumulator.consume({ type: "permission_denied", name: "command" });
    accumulator.consume({ type: "permission_denied" });
    accumulator.consume({
      type: "result",
      status: "success",
      session_id: "conversation-1",
      result: answer,
    });

    expect(accumulator.finish()).toMatchObject({
      conversationId: "conversation-1",
      observedToolNames: ["search_web", "read_file", "command"],
      observedToolCounts: { search_web: 1, read_file: 1, command: 1 },
      permissionDenials: 2,
    });
    expect(accumulator.finish().observedSourceHashes).toHaveLength(1);
    expect(accumulator.finish().observedWorkspacePathHashes).toHaveLength(1);
  });

  it("does not count reads outside approved roots, such as agy page caches, as workspace use", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "supi-consulting-roots-")));
    try {
      const workspace = join(root, "workspace");
      const cache = join(root, "home", ".gemini", "antigravity-cli", "brain", "c1", "page.md");
      const accumulator = new AntigravityEventAccumulator({ workspaceDirectory: workspace });
      const tool = (id: string, name: string, input: Record<string, unknown>) => {
        accumulator.consume({ type: "tool_use", id, name, input });
        accumulator.consume({ type: "tool_result", tool_use_id: id, status: "success" });
      };
      tool("web", "read_url_content", { Url: "https://example.com/" });
      tool("cache", "view_file", { AbsolutePath: cache });
      tool("search", "grep_search", { Query: "needle" });
      accumulator.consume({ type: "result", status: "success", session_id: "c1", result: answer });
      const facts = accumulator.finish();
      expect(facts.successfulToolNames).toEqual(["read_url_content", "grep_search"]);
      expect(facts.observedSourceHashes).toHaveLength(1);
      expect(facts.observedWorkspacePathHashes).toEqual([]);

      const inside = new AntigravityEventAccumulator({ workspaceDirectory: workspace });
      inside.consume({
        type: "tool_use",
        id: "f",
        name: "view_file",
        input: { AbsolutePath: join(workspace, "src", "index.ts") },
      });
      inside.consume({ type: "tool_result", tool_use_id: "f", status: "success" });
      inside.consume({ type: "result", status: "success", session_id: "c2", result: answer });
      expect(inside.finish()).toMatchObject({
        successfulToolNames: ["view_file"],
        observedWorkspacePathHashes: [expect.any(String)],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reduces tool blocks nested in assistant messages", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ type: "system", session_id: "conversation-2" });
    accumulator.consume({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "nested-file",
            name: "grep_search",
            input: { path: "src/index.ts" },
          },
        ],
      },
    });
    accumulator.consume({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "nested-file", is_error: false }],
      },
    });
    accumulator.consume({
      type: "result",
      subtype: "success",
      session_id: "conversation-2",
      result: answer,
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolNames: ["grep_search"],
      successfulToolNames: ["grep_search"],
      observedWorkspacePathHashes: [expect.any(String)],
    });
  });

  it("rejects malformed terminal output", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ type: "system", session_id: "conversation-1" });
    accumulator.consume({ type: "result", status: "success", result: {} });
    expect(() => accumulator.finish()).toThrow();
  });
});
