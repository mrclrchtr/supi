import { normalizeQuestionnaire, openAskUserForm } from "@mrclrchtr/supi-ask-user/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentsFormHarness } from "../helpers/agents-form-harness.ts";

const harnesses: Array<Awaited<ReturnType<typeof createAgentsFormHarness>>> = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("/agents with the Ask User tool", () => {
  it("closes the viewer when the editor-area form opens without cancelling the turn", async () => {
    const harness = await createAgentsFormHarness();
    harnesses.push(harness);
    const viewer = harness.openViewer();
    await vi.waitFor(() => expect(harness.tui.hasOverlay()).toBe(true));

    const form = harness.startForm();

    await vi.waitFor(() => expect(harness.tui.hasOverlay()).toBe(false));
    await viewer;
    expect(harness.abort).not.toHaveBeenCalled();
    expect(harness.tui.getFocusedComponent()?.render(100).join("\n")).toContain(
      "Which formatter should I use?",
    );
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    await expect(form).resolves.toMatchObject({
      details: { outcome: "submitted" },
    });
    expect(harness.abort).not.toHaveBeenCalled();
    expect(harness.tui.hasOverlay()).toBe(false);
  });

  it("does not open the viewer if the tool starts during viewer loading", async () => {
    const harness = await createAgentsFormHarness();
    harnesses.push(harness);
    const viewer = harness.openViewer();
    const form = harness.startForm();

    await viewer;
    expect(harness.tui.hasOverlay()).toBe(false);
    expect(harness.screens).toHaveLength(1);
    expect(harness.abort).not.toHaveBeenCalled();
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    await expect(form).resolves.toMatchObject({ details: { outcome: "submitted" } });
  });

  it("waits for mounting before closing a viewer whose form started in its factory", async () => {
    const harness = await createAgentsFormHarness();
    harnesses.push(harness);
    const custom = harness.ctx.ui.custom;
    let form: Promise<unknown> | undefined;
    harness.ctx.ui.custom = (factory, options) =>
      custom((tui, theme, kb, done) => {
        const component = factory(tui, theme, kb, done);
        if (options?.overlay) form = harness.startForm();
        return component;
      }, options);

    await harness.openViewer();

    expect(harness.tui.hasOverlay()).toBe(false);
    expect(harness.screens).toHaveLength(2);
    expect(harness.abort).not.toHaveBeenCalled();
    expect(harness.tui.getFocusedComponent()?.render(100).join("\n")).toContain(
      "Which formatter should I use?",
    );
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    harness.tui.getFocusedComponent()?.handleInput?.("\r");
    await expect(form).resolves.toMatchObject({ details: { outcome: "submitted" } });
  });

  it("keeps Escape local to a reusable overlay form above the viewer", async () => {
    const harness = await createAgentsFormHarness();
    harnesses.push(harness);
    const viewer = harness.openViewer();
    await vi.waitFor(() => expect(harness.tui.hasOverlay()).toBe(true));
    const viewerComponent = harness.tui.getFocusedComponent();
    const questionnaire = normalizeQuestionnaire({
      questions: [
        {
          type: "choice",
          id: "scope",
          header: "Scope",
          prompt: "Which scope?",
          options: [
            { value: "small", label: "Small" },
            { value: "large", label: "Large" },
          ],
        },
      ],
    });
    const form = openAskUserForm(questionnaire, { ui: harness.ctx.ui, overlay: true });
    await vi.waitFor(() => expect(harness.screens).toHaveLength(2));

    harness.tui.getFocusedComponent()?.handleInput?.("\u001b");

    await expect(form).resolves.toEqual({ kind: "cancel" });
    expect(harness.tui.hasOverlay()).toBe(true);
    expect(harness.tui.getFocusedComponent()).toBe(viewerComponent);
    expect(harness.abort).not.toHaveBeenCalled();
    harness.tui.getFocusedComponent()?.handleInput?.("\u001b");
    await viewer;
    expect(harness.tui.hasOverlay()).toBe(false);
  });
});
