import { type ExtensionUIContext, initTheme } from "@earendil-works/pi-coding-agent";
import type { SessionCapabilityState } from "@mrclrchtr/supi-core/session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCapabilitySelector } from "../../src/session-capabilities-ui.ts";

function mouseClick(y: number) {
  return {
    type: "click" as const,
    button: "left" as const,
    x: 0,
    y,
    screenX: 0,
    screenY: y,
    width: 100,
    height: 30,
    shift: false,
    alt: false,
    ctrl: false,
  };
}

function makeSelector(overrides: { skills?: { name: string; description: string }[] } = {}) {
  const state: SessionCapabilityState = {
    version: 1,
    eligibleToolNames: ["tool-one", "tool-two"],
    initiallyInactiveToolNames: [],
    toolDenylist: ["tool-one"],
    hiddenSkillNames: [],
  };
  const onChange = vi.fn();
  const selector = createCapabilitySelector({
    done: vi.fn(),
    onChange,
    skills: overrides.skills,
    state,
    theme: { fg: (_color, text) => text, bold: (text) => text } as ExtensionUIContext["theme"],
    tools: [
      { name: "tool-one", description: "First tool description", source: "@example/tools" },
      { name: "tool-two", description: "Second tool description", source: "@example/tools" },
    ],
    tui: { requestRender: vi.fn() },
  });
  return { onChange, selector };
}

beforeAll(() => initTheme("dark"));

describe("session capability selector layout and controls", () => {
  it("renders bordered tabs, grouped rows, aligned values, descriptions, and hints", () => {
    const { selector } = makeSelector();
    for (let index = 0; index < 4; index++) selector.handleInput("\u001b[B");
    const lines = selector.render(100);
    const text = lines.join("\n");
    const valueLines = lines.filter((line) =>
      ["Disable All Tools", "@example/tools", "tool-one"].some((label) => line.includes(label)),
    );

    expect(lines[0]).not.toBe("");
    expect(text).toContain("Session Capabilities");
    expect(text).toContain("[Tools]");
    expect(text).toContain("Skills");
    expect(text).toContain("@example/tools");
    expect(text).toContain("→ tool-one");
    expect(text).toContain("First tool description");
    expect(text).toContain("Enter for actions · Space to toggle");
    expect(
      new Set(
        valueLines.map((line) =>
          line.indexOf(
            line.includes("Disabled") ? "Disabled" : line.includes("Mixed") ? "Mixed" : "Apply",
          ),
        ),
      ).size,
    ).toBe(1);
    expect(lines.at(-1)).not.toBe("");

    selector.handleInput("\t");
    expect(selector.render(100).join("\n")).toContain("[Skills]");
  });

  it("uses Space to toggle a tool and Enter to open its action menu", () => {
    const { onChange, selector } = makeSelector();
    for (const character of "tool-one") selector.handleInput(character);
    selector.handleInput("\u001b[B");
    selector.handleInput("\r");

    expect(selector.render(100).join("\n")).toContain("Enable tool");
    expect(onChange).not.toHaveBeenCalled();
    selector.handleInput("\u001b");
    selector.handleInput(" ");

    expect(onChange).toHaveBeenCalledWith("tool:tool-one", "Enabled");
  });

  it("keeps the Tools section active while a package menu is open", () => {
    const { onChange, selector } = makeSelector();
    selector.handleInput("@example/tools");
    selector.handleInput("\r");
    selector.handleInput("\t");

    expect(selector.render(100).join("\n")).toContain("[Tools]");
    expect(selector.render(100).join("\n")).toContain("Disable package tools");
    selector.handleInput("\u001b[B");
    selector.handleInput("\r");

    expect(onChange).toHaveBeenCalledWith("package:@example/tools", "enable");
    expect(selector.render(100).join("\n")).toContain("[Tools]");
  });

  it("keeps mouse support for list toggles and package actions", () => {
    const { onChange, selector } = makeSelector();
    selector.handleMouse(mouseClick(8));
    expect(onChange).toHaveBeenCalledWith("tool:tool-one", "Enabled");

    selector.handleMouse(mouseClick(7));
    expect(selector.render(100).join("\n")).toContain("Disable package tools");
    selector.handleMouse(mouseClick(4));

    expect(onChange).toHaveBeenLastCalledWith("package:@example/tools", "enable");
  });
});
