// The prompt snippet and guidelines steer the model toward focused decision
// questions. The intent of these tests is to lock in the steering signal so
// future edits can't quietly remove the boundedness/focus emphasis.

import { describe, expect, it } from "vitest";
import { askUserPromptGuidelines, askUserPromptSnippet } from "../src/ask-user.ts";

describe("ask_user prompt guidance", () => {
  it("snippet emphasizes pause-for-decision intent and bounded count", () => {
    expect(askUserPromptSnippet).toMatch(/pause/i);
    expect(askUserPromptSnippet).toMatch(/decision|proceed/i);
    expect(askUserPromptSnippet).toMatch(/1-4/);
  });

  it("guidelines steer toward focused, bounded questionnaires", () => {
    const all = askUserPromptGuidelines.join("\n");
    expect(all).toMatch(/focused/i);
    expect(all).toMatch(/1-4/);
    expect(all).toMatch(/never as a substitute/i);
  });

  it("guidelines explain when to use each question type", () => {
    const all = askUserPromptGuidelines.join("\n");
    expect(all).toMatch(/yesno only for genuinely yes.no questions/i);
    expect(all).toMatch(/choice for picking between named alternatives/i);
    expect(all).toMatch(/multichoice/i);
    expect(all).toMatch(/text only when freeform/i);
  });

  it("guidelines describe previews and explicit discuss/other controls", () => {
    const all = askUserPromptGuidelines.join("\n");
    expect(all).toMatch(/allowOther/i);
    expect(all).toMatch(/allowDiscuss/i);
    expect(all).toMatch(/preview/i);
  });

  it("guidelines warn against running concurrent ask_user calls", () => {
    const all = askUserPromptGuidelines.join("\n");
    expect(all).toMatch(/in flight/i);
  });
});
