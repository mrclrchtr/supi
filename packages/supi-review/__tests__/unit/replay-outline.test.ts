import { describe, expect, it } from "vitest";
import { projectReplayOutline } from "../../src/audit/replay-outline.ts";

const secrets = {
  text: "UNIQUE_MESSAGE_TEXT_SECRET",
  error: "UNIQUE_PROVIDER_ERROR_SECRET",
  argument: "UNIQUE_TOOL_ARGUMENT_SECRET",
  result: "UNIQUE_TOOL_RESULT_SECRET",
};

describe("Replay Outline projector", () => {
  it("projects exact metadata without recursively reading captured evidence", () => {
    const messages: unknown[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: secrets.text },
          {
            type: "toolCall",
            name: "read",
            arguments: { path: `/private/${secrets.argument}` },
          },
          { type: "toolCall", name: "read", arguments: {} },
          { type: "unknown-kind", nested: { toolName: "must-not-appear" } },
        ],
        stopReason: "toolUse",
      },
      {
        role: "toolResult",
        toolName: "read",
        content: [{ type: "text", text: secrets.result }],
        details: { result: secrets.result },
        isError: false,
      },
      {
        role: "assistant",
        content: "plain text content",
        stopReason: "error",
        errorMessage: secrets.error,
      },
      { content: [7, null, { value: "unknown" }] },
      "captured non-object value",
    ];

    const outline = projectReplayOutline(messages);

    expect(outline).toEqual([
      {
        index: 0,
        role: "assistant",
        contentKinds: ["text", "toolCall", "unknown-kind"],
        contentCharacters: JSON.stringify((messages[0] as { content: unknown }).content).length,
        toolNames: ["read"],
        stopReason: "toolUse",
        hasError: false,
      },
      {
        index: 1,
        role: "toolResult",
        contentKinds: ["text"],
        contentCharacters: JSON.stringify((messages[1] as { content: unknown }).content).length,
        toolNames: ["read"],
        hasError: false,
      },
      {
        index: 2,
        role: "assistant",
        contentKinds: ["text"],
        contentCharacters: JSON.stringify((messages[2] as { content: unknown }).content).length,
        toolNames: [],
        stopReason: "error",
        hasError: true,
      },
      {
        index: 3,
        role: "unknown",
        contentKinds: ["unknown"],
        contentCharacters: JSON.stringify((messages[3] as { content: unknown }).content).length,
        toolNames: [],
        hasError: false,
      },
      {
        index: 4,
        role: "unknown",
        contentKinds: ["unknown"],
        contentCharacters: 0,
        toolNames: [],
        hasError: false,
      },
    ]);

    const serialized = JSON.stringify(outline);
    for (const secret of Object.values(secrets)) expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("must-not-appear");
  });

  it("uses persisted array positions without filtering or renumbering", () => {
    const outline = projectReplayOutline([null, { role: "assistant" }, 3]);
    expect(outline.map((row) => row.index)).toEqual([0, 1, 2]);
  });
});
