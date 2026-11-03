import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { expect, it } from "vitest";
import piDocsPolicy from "../../.pi/extensions/pi-docs-policy.ts";

// Exercise the installed prompt builder so Pi upgrades expose stock-policy wording changes.
const { buildSystemPrompt, normalizeBuildSystemPromptOptions } = await import(
  new URL("./core/system-prompt.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href
);

it("applies the evidence-scaled docs policy to the installed Pi stock prompt without warnings", async () => {
  const pi = createPiMock();
  const ctx = makeCtx();
  piDocsPolicy(pi);
  const systemPromptOptions = normalizeBuildSystemPromptOptions({
    cwd: ctx.cwd,
    contextFiles: [],
    skills: [],
  });
  const systemPrompt = buildSystemPrompt(systemPromptOptions);

  const result = await getHandlerOrThrow(pi, "before_agent_start")(
    {
      type: "before_agent_start",
      messageType: "user",
      prompt: "Help with Pi",
      systemPrompt,
      systemPromptOptions,
    },
    ctx,
  );

  expect(ctx.ui.notify).not.toHaveBeenCalled();
  expect(result?.systemPrompt).toContain(
    "- Read relevant sections of pi .md files; follow links to related docs (e.g., tui.md for TUI API details) when needed for the task.",
  );
  expect(result.systemPrompt).not.toContain("read the relevant docs and examples in full");
});
