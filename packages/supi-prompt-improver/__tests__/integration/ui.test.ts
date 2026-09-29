import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type CommandHarness,
  createCommandHarness,
  interact,
  makeAssistantMessage,
} from "../helpers/command-harness.ts";

const harnesses: CommandHarness[] = [];

beforeAll(() => initTheme("dark"));
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

describe("prompt improver overlay layout", () => {
  it.each([40, 12])("scrolls to the final proposal and keeps controls at %i rows", async (rows) => {
    const proposal = Array.from({ length: 80 }, (_, index) => `Proposal line ${index + 1}`).join(
      "\n",
    );
    const harness = makeHarness({
      terminalRows: rows,
      responses: [
        makeAssistantMessage({ kind: "proposal", proposal: `${proposal}\nFINAL SENTINEL` }),
      ],
    });
    let visible: string[] = [];
    harness.setCustomDriver((component, index) => {
      if (index === 0) {
        interact(component, "\r");
        return;
      }
      if (index !== 2) return;
      for (let step = 0; step < 30; step += 1) interact(component, "\u001b[6~");
      visible = harness.renderOverlay(index);
      interact(component, "\u001b");
    });

    await harness.handler("Review all proposal lines");

    const text = visible.join("\n");
    expect(text).toContain("FINAL SENTINEL");
    expect(text).toContain("Esc dismiss");
    expect(visible.length).toBeLessThanOrEqual(rows - 2);
  });

  it("reflows cached review output after a resize without input", async () => {
    const proposal = `${"Narrow terminal wraps this proposal line ".repeat(8)}\nFINAL SENTINEL`;
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "proposal", proposal })],
    });
    let resized: string[] = [];
    harness.setCustomDriver((component, index) => {
      if (index === 0) {
        interact(component, "\r");
        return;
      }
      if (index !== 2) return;
      component.render(92);
      harness.setTerminalSize(12, 50);
      resized = harness.renderOverlay(index);
      interact(component, "\u001b");
    });

    await harness.handler("Review after a terminal resize");

    expect(resized.join("\n")).toContain("Esc dismiss");
    expect(resized.every((line) => visibleWidth(line) <= 46)).toBe(true);
  });

  it.each([
    { name: "stock", useDefaultEditor: true },
    { name: "ghost", useDefaultEditor: false },
  ])(
    "keeps Ctrl+J as a newline in the $name editor until confirmation",
    async ({ useDefaultEditor }) => {
      const harness = makeHarness({
        useDefaultEditor,
        responses: [makeAssistantMessage({ kind: "unchanged" })],
      });
      let stateBeforeConfirmation:
        | { requests: number; editorText: string; overlayCount: number }
        | undefined;
      harness.setCustomDriver((component, index) => {
        if (index !== 0) return;
        interact(component, "\n");
        stateBeforeConfirmation = {
          requests: harness.requestContexts.length,
          editorText: harness.getEditorText(),
          overlayCount: harness.interactions.length,
        };
        interact(component, "\r");
      });

      await harness.handler("Keep this draft");

      expect(stateBeforeConfirmation).toEqual({
        requests: 0,
        editorText: "post-command baseline",
        overlayCount: 1,
      });
      expect(harness.requestContexts).toHaveLength(1);
      expect(harness.getEditorText()).toBe("Keep this draft\n");
    },
  );

  it("keeps a long local editor usable and its footer visible after resize", async () => {
    const draft = Array.from({ length: 24 }, (_, index) => `draft line ${index + 1}`).join("\n");
    const harness = makeHarness({
      terminalRows: 12,
      useDefaultEditor: true,
      responses: [makeAssistantMessage({ kind: "unchanged" })],
    });
    let initial: string[] = [];
    let resized: string[] = [];
    harness.setCustomDriver((component, index) => {
      if (index !== 0) return;
      initial = harness.renderOverlay(index);
      harness.setTerminalSize(12, 50);
      resized = harness.renderOverlay(index);
      interact(component, "X");
      interact(component, "\r");
    });

    await harness.handler(draft);

    expect(initial.join("\n")).toContain("Enter confirms");
    expect(resized.join("\n")).toContain("Enter confirms");
    expect(resized.every((line) => visibleWidth(line) <= 46)).toBe(true);
    expect(harness.getEditorText()).toContain("draft line 24X");
  });
});

function makeHarness(options: Parameters<typeof createCommandHarness>[0] = {}): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}
