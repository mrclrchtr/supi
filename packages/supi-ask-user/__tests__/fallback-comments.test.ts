import { describe, expect, it } from "vitest";
import { normalizeQuestionnaire } from "../normalize.ts";
import type { AskUserParams } from "../schema.ts";
import { type FallbackUi, runFallbackQuestionnaire } from "../ui-fallback.ts";

function scriptedUi(results: Array<string | undefined>): FallbackUi {
  const queue = [...results];
  return {
    select: async (_title, options) => {
      const result = queue.shift();
      if (result === undefined) return undefined;
      const numeric = Number(result);
      if (!Number.isNaN(numeric) && `${numeric}` === result) return options[numeric];
      return result;
    },
    input: async () => {
      const result = queue.shift();
      return result ?? undefined;
    },
  };
}

describe("runFallbackQuestionnaire — reduced fallback semantics", () => {
  it("allows discuss with an empty follow-up input", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "choice",
          id: "scope",
          header: "Scope",
          prompt: "Pick scope",
          allowDiscuss: true,
          options: [
            { value: "narrow", label: "Narrow", preview: "ignored in fallback" },
            { value: "broad", label: "Broad" },
          ],
        },
      ],
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui: scriptedUi(["2", ""]),
    });
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ source: "discuss" }],
    });
  });

  it("flattens previews by omitting them from select labels", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "choice",
          id: "scope",
          header: "Scope",
          prompt: "Pick scope",
          options: [
            { value: "narrow", label: "Narrow", preview: "const a = 1;" },
            { value: "broad", label: "Broad" },
          ],
        },
      ],
    };
    let seen: string[] = [];
    const ui: FallbackUi = {
      select: async (_title, options) => {
        seen = options;
        return options[0];
      },
      input: async () => undefined,
    };
    await runFallbackQuestionnaire(normalizeQuestionnaire(params), { ui });
    expect(seen.join(" | ")).not.toContain("const a = 1;");
    expect(seen[0]).toContain("Narrow");
  });
});
