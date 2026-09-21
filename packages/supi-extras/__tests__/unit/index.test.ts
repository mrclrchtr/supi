import { createPiMock, getHandlerOrThrow } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import extras from "../../src/index.ts";

const PATH_RESOLUTION_SECTION = "supi_extras_path_resolution";
const PATH_RESOLUTION_GUIDANCE =
  "Treat `@<path>` in a user message as the path `<path>`: resolve relative paths from the current working directory; absolute paths stay absolute.";

type PromptOptions = {
  sections: Record<string, string>;
  promptGuidelines?: string[];
  selectedTools?: string[];
  customPrompt?: string;
  appendSystemPrompt?: string;
  forceSystemPrompt?: string;
};

function setup() {
  const pi = createPiMock();
  extras(pi as unknown as Parameters<typeof extras>[0]);
  return getHandlerOrThrow(pi, "before_agent_start");
}

function eventWith(systemPromptOptions: PromptOptions) {
  return {
    systemPrompt: "The original system prompt",
    systemPromptOptions,
  };
}

describe("supi-extras path guidance", () => {
  it("adds the guidance as a package-owned structured section", async () => {
    const handler = setup();
    const systemPromptOptions: PromptOptions = { sections: {} };

    const result = await handler(eventWith(systemPromptOptions));

    expect(result).toBeUndefined();
    expect(systemPromptOptions.sections).toEqual({
      [PATH_RESOLUTION_SECTION]: PATH_RESOLUTION_GUIDANCE,
    });
  });

  it("keeps one section after repeated hook calls", async () => {
    const handler = setup();
    const systemPromptOptions: PromptOptions = {
      sections: { existing: "Keep this section" },
    };
    const event = eventWith(systemPromptOptions);

    await handler(event);
    await handler(event);

    expect(systemPromptOptions.sections).toEqual({
      existing: "Keep this section",
      [PATH_RESOLUTION_SECTION]: PATH_RESOLUTION_GUIDANCE,
    });
    expect(Object.values(systemPromptOptions.sections)).toHaveLength(2);
  });

  it("preserves existing prompt options, including another extension's forced prompt", async () => {
    const handler = setup();
    const systemPromptOptions: PromptOptions = {
      sections: { existing: "Keep this section" },
      promptGuidelines: ["Keep this guideline"],
      selectedTools: ["read", "bash"],
      customPrompt: "Keep this custom prompt",
      appendSystemPrompt: "Keep this appended prompt",
      forceSystemPrompt: "Another extension owns this forced prompt",
    };
    const before = structuredClone(systemPromptOptions);

    const result = await handler(eventWith(systemPromptOptions));

    expect(result).toBeUndefined();
    expect(systemPromptOptions).toEqual({
      ...before,
      sections: {
        ...before.sections,
        [PATH_RESOLUTION_SECTION]: PATH_RESOLUTION_GUIDANCE,
      },
    });
  });
});
