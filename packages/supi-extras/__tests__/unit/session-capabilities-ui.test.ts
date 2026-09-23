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

beforeAll(() => initTheme("dark"));

describe("session capability selector mouse input", () => {
  it("maps main-list clicks below the selector headers", () => {
    const state: SessionCapabilityState = {
      version: 1,
      eligibleToolNames: ["tool-one", "tool-two"],
      initiallyInactiveToolNames: [],
      toolDenylist: ["tool-one", "tool-two"],
      hiddenSkillNames: [],
    };
    const onChange = vi.fn();
    const selector = createCapabilitySelector({
      done: vi.fn(),
      onChange,
      skills: undefined,
      state,
      theme: { fg: (_color, text) => text, bold: (text) => text } as ExtensionUIContext["theme"],
      tools: [
        { name: "tool-one", description: "One", source: "@example/tools" },
        { name: "tool-two", description: "Two", source: "@example/tools" },
      ],
      tui: { requestRender: vi.fn() },
    });

    expect(selector.handleMouse(mouseClick(1))).toBeUndefined();
    selector.handleMouse(mouseClick(7));

    expect(selector.render(100).join("\n")).toContain("Disable package tools");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("maps package-submenu clicks below the selector headers", () => {
    const state: SessionCapabilityState = {
      version: 1,
      eligibleToolNames: ["tool-one", "tool-two"],
      initiallyInactiveToolNames: [],
      toolDenylist: ["tool-one", "tool-two"],
      hiddenSkillNames: [],
    };
    const onChange = vi.fn();
    const selector = createCapabilitySelector({
      done: vi.fn(),
      onChange,
      skills: undefined,
      state,
      theme: { fg: (_color, text) => text, bold: (text) => text } as ExtensionUIContext["theme"],
      tools: [
        { name: "tool-one", description: "One", source: "@example/tools" },
        { name: "tool-two", description: "Two", source: "@example/tools" },
      ],
      tui: { requestRender: vi.fn() },
    });

    selector.handleMouse(mouseClick(7));
    selector.handleMouse(mouseClick(3));

    expect(onChange).toHaveBeenCalledWith("package:@example/tools", "enable");
  });
});
