import type { EditorComponent } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { NormalizedQuestionnaire } from "../../src/types.ts";
import { runFormQuestionnaire } from "../../src/ui/form.ts";
import { calculateFormHeightLimit } from "../../src/ui/form-viewport.ts";
import type { AskUserUiContext, EditorFactory } from "../../src/ui/types.ts";
import { makeFormCtx } from "../helpers/index.ts";

function pageUpKey(): string {
  return "\u001b[5~";
}

function altPageUpKey(): string {
  return "\u001b[5;3~";
}

function altUKey(): string {
  return "\u001bu";
}

function upKey(): string {
  return "\u001b[A";
}

function downKey(): string {
  return "\u001b[B";
}

function rightKey(): string {
  return "\u001b[C";
}

function enterKey(): string {
  return "\r";
}

async function openForm(
  questionnaire: NormalizedQuestionnaire,
  terminalRows: number,
  editorFactory?: EditorFactory,
) {
  const fixture = makeFormCtx({ terminalRows });
  const ui = editorFactory
    ? { ...fixture.ctx.ui, getEditorComponent: () => editorFactory }
    : fixture.ctx.ui;
  void runFormQuestionnaire(questionnaire, {
    ui: ui as unknown as AskUserUiContext,
  });
  await Promise.resolve();
  if (!fixture.captured.value) throw new Error("form component was not created");
  return { component: fixture.captured.value, ...fixture };
}

class FakeModalEditor implements EditorComponent {
  text = "";
  mode: "insert" | "normal" = "insert";
  handledInputs: string[] = [];
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  onEscape?: () => void;

  render(): string[] {
    return [`FAKE_MODAL:${this.mode}`];
  }

  invalidate(): void {}

  getText(): string {
    return this.text;
  }

  setText(value: string): void {
    this.text = value;
  }

  handleInput(data: string): void {
    this.handledInputs.push(data);
    if (data === "\u001b") {
      if (this.mode === "insert") this.mode = "normal";
      else this.onEscape?.();
      return;
    }
    if (data === "\r") this.onSubmit?.(this.text);
  }
}

function choiceQuestionnaire(optionCount: number): NormalizedQuestionnaire {
  return {
    title: "Many choices",
    questions: [
      {
        type: "choice",
        id: "choice",
        header: "Choice",
        prompt: "Select one option.",
        options: Array.from({ length: optionCount }, (_entry, index) => ({
          value: `option-${index + 1}`,
          label: `Option ${index + 1}`,
        })),
        multi: false,
        recommendedIndexes: [0],
      },
    ],
  };
}

describe("Ask User form viewport", () => {
  it("does not constrain a short form", async () => {
    const { component } = await openForm(choiceQuestionnaire(2), 60);
    const rendered = component.render(80).join("\n");

    expect(rendered).not.toContain("PgUp/PgDn scroll");
    expect(rendered).toContain("Option 1");
    expect(rendered).toContain("Option 2");
  });

  it("limits a long form to the configured terminal height budget", async () => {
    const terminalRows = 20;
    const { component } = await openForm(choiceQuestionnaire(12), terminalRows);
    const lines = component.render(60);

    expect(lines.length).toBeLessThanOrEqual(calculateFormHeightLimit(terminalRows));
    expect(lines.join("\n")).toContain("PgUp/PgDn scroll");
  });

  it("keeps the focused choice visible while arrow navigation moves the window", async () => {
    const { component } = await openForm(choiceQuestionnaire(12), 20);

    for (let index = 1; index < 12; index += 1) component.handleInput?.(downKey());

    const rendered = component.render(60).join("\n");
    expect(rendered).toContain("→ ( ) Option 12");
    expect(rendered).not.toContain("→ (*) Option 1");
  });

  it("re-reveals the focused choice after terminal height changes", async () => {
    const { component, terminal } = await openForm(choiceQuestionnaire(12), 60);
    component.render(60);
    for (let index = 1; index < 12; index += 1) component.handleInput?.(downKey());
    expect(component.render(60).join("\n")).toContain("→ ( ) Option 12");

    terminal.rows = 20;
    const resized = component.render(60);

    expect(resized.length).toBeLessThanOrEqual(calculateFormHeightLimit(20));
    expect(resized.join("\n")).toContain("→ ( ) Option 12");
  });

  it("keeps the focused choice visible after marking it unanswered", async () => {
    const { component } = await openForm(choiceQuestionnaire(12), 20);
    for (let index = 1; index < 12; index += 1) component.handleInput?.(downKey());
    component.render(60);

    component.handleInput?.("u");

    expect(component.render(60).join("\n")).toContain("→ ( ) Option 12");
  });

  it.each([7, 8, 10])("shows overflow below at narrow width %i", async (width) => {
    const { component } = await openForm(choiceQuestionnaire(12), 20);
    const lines = component.render(width);

    expect(lines.length).toBeLessThanOrEqual(calculateFormHeightLimit(20));
    expect(lines.join("\n")).toContain("↓");
  });

  it("scrolls back to the question when Up is pressed at the first choice", async () => {
    const prompt = Array.from({ length: 24 }, (_entry, index) =>
      index === 0 ? "START_MARKER Read this first." : `Context paragraph ${index + 1}.`,
    ).join("\n\n");
    const questionnaire = choiceQuestionnaire(2);
    const question = questionnaire.questions[0];
    if (question?.type !== "choice") throw new Error("expected choice question");
    question.prompt = prompt;

    const { component } = await openForm(questionnaire, 20);
    expect(component.render(60).join("\n")).not.toContain("START_MARKER");

    for (let index = 0; index < 100; index += 1) component.handleInput?.(upKey());

    expect(component.render(60).join("\n")).toContain("START_MARKER");
  });

  it("uses Page Up to expose long prompt content above the focused choice", async () => {
    const prompt = Array.from({ length: 24 }, (_entry, index) =>
      index === 0 ? "START_MARKER Read this first." : `Context paragraph ${index + 1}.`,
    ).join("\n\n");
    const questionnaire = choiceQuestionnaire(2);
    const question = questionnaire.questions[0];
    if (question?.type !== "choice") throw new Error("expected choice question");
    question.prompt = prompt;

    const { component } = await openForm(questionnaire, 20);
    expect(component.render(60).join("\n")).not.toContain("START_MARKER");

    for (let index = 0; index < 20; index += 1) component.handleInput?.(pageUpKey());

    const rendered = component.render(60).join("\n");
    expect(rendered).toContain("START_MARKER");
    expect(rendered).toContain("Many choices");
  });

  it("re-reveals a modal editor after Escape changes its mode", async () => {
    const prompt = Array.from(
      { length: 24 },
      (_entry, index) => `Context paragraph ${index + 1}.`,
    ).join("\n\n");
    const questionnaire: NormalizedQuestionnaire = {
      title: "Long text",
      questions: [
        {
          type: "text",
          id: "text",
          header: "Text",
          prompt,
        },
      ],
    };
    const editor = new FakeModalEditor();
    const { component } = await openForm(questionnaire, 20, () => editor);
    component.render(60);
    component.handleInput?.(pageUpKey());
    expect(editor.handledInputs).toContain(pageUpKey());
    for (let index = 0; index < 20; index += 1) component.handleInput?.(altPageUpKey());
    expect(component.render(60).join("\n")).not.toContain("FAKE_MODAL");

    component.handleInput?.("\u001b");

    expect(component.render(60).join("\n")).toContain("FAKE_MODAL:normal");
  });

  it("re-reveals the text editor after marking a scrolled form unanswered", async () => {
    const prompt = Array.from(
      { length: 24 },
      (_entry, index) => `Context paragraph ${index + 1}.`,
    ).join("\n\n");
    const questionnaire: NormalizedQuestionnaire = {
      questions: [{ type: "text", id: "text", header: "Text", prompt }],
    };
    const editor = new FakeModalEditor();
    const { component } = await openForm(questionnaire, 20, () => editor);
    component.render(60);
    for (let index = 0; index < 20; index += 1) component.handleInput?.(altPageUpKey());
    expect(component.render(60).join("\n")).not.toContain("FAKE_MODAL");

    component.handleInput?.(altUKey());

    expect(component.render(60).join("\n")).toContain("FAKE_MODAL");
  });

  it("keeps all context-specific key hints reachable", async () => {
    const { component } = await openForm(choiceQuestionnaire(12), 20);
    component.render(60);
    for (let index = 1; index < 12; index += 1) component.handleInput?.(downKey());
    for (let index = 0; index < 100; index += 1) component.handleInput?.(downKey());

    const rendered = component.render(60).join("\n");
    expect(rendered).toContain("n option comment");
    expect(rendered).toContain("Esc cancel");
  });

  it("opens a long review with the submit row visible", async () => {
    const questionnaire: NormalizedQuestionnaire = {
      title: "Long review",
      questions: Array.from({ length: 10 }, (_entry, index) => ({
        type: "choice" as const,
        id: `question-${index + 1}`,
        header: `Question ${index + 1}`,
        prompt: `Select answer ${index + 1}.`,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
        multi: false,
        recommendedIndexes: [0],
      })),
    };
    const { component } = await openForm(questionnaire, 20);

    for (let index = 0; index < questionnaire.questions.length; index += 1) {
      component.handleInput?.(rightKey());
    }

    const rendered = component.render(60).join("\n");
    expect(rendered).toContain("Review · all questions");
    expect(rendered).toContain("→ Submit form");
    expect(rendered).toContain("PgUp/PgDn scroll");

    component.handleInput?.(enterKey());
  });
});
