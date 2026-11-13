import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { BSD_SED_HINT, BSD_SED_HINT_MARKER, registerShellHints } from "../../src/shell-hints.ts";

const sedError = 'sed: 1: "src/a.ts": command a expects \\ followed by text';

function setup(branch: unknown[] = []) {
  const pi = createPiMock();
  registerShellHints(pi as never);
  const ctx = makeCtx({ sessionManager: { getBranch: () => branch } });
  const handler = getHandlerOrThrow(pi, "tool_result");
  const run = (toolName: string, text: string) =>
    handler({ toolName, content: [{ type: "text", text }] } as never, ctx as never) as
      | { content: Array<{ type: string; text: string }> }
      | undefined;
  return { run };
}

describe("registerShellHints", () => {
  it("appends the BSD sed hint to a bash result with a sed script error", () => {
    const result = setup().run("bash", `${sedError}\n\nCommand exited with code 1`);
    expect(result?.content.at(-1)).toEqual({ type: "text", text: BSD_SED_HINT });
    expect(result?.content[0]?.text).toContain(sedError);
  });

  it("ignores other tools, other errors, and results that already carry the hint", () => {
    const { run } = setup();
    expect(run("read", sedError)).toBeUndefined();
    expect(run("bash", "grep: invalid option")).toBeUndefined();
    expect(run("bash", `${sedError}\n${BSD_SED_HINT}`)).toBeUndefined();
  });

  it("shows the hint once per session branch", () => {
    const shown = {
      type: "message",
      message: { role: "toolResult", content: [{ type: "text", text: BSD_SED_HINT_MARKER }] },
    };
    expect(setup([shown]).run("bash", sedError)).toBeUndefined();
  });
});
