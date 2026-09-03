import { describe, expect, it } from "vitest";
import { buildAntigravityEnvironment } from "../../src/process/environment.ts";
import { AntigravityEventAccumulator } from "../../src/process/events.ts";
import {
  BoundedLineParser,
  BoundedStderrCapture,
  StreamLimitError,
} from "../../src/process/ndjson.ts";

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
