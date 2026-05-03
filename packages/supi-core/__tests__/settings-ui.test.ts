import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>(
    "@mariozechner/pi-coding-agent",
  );
  return {
    ...actual,
    getSettingsListTheme: () => ({}),
  };
});

import {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
} from "../src/settings-registry.ts";
import { openSettingsOverlay } from "../src/settings-ui.ts";

afterEach(() => {
  clearRegisteredSettings();
});

describe("settings-ui id collision", () => {
  it("prefixes item ids with section id to prevent collision", () => {
    const lspCalls: string[] = [];
    const claudeCalls: string[] = [];

    registerSettings({
      id: "lsp",
      label: "LSP",
      loadValues: () => [
        { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
      ],
      persistChange: (_scope, _cwd, id, value) => {
        lspCalls.push(`${id}=${value}`);
      },
    });

    registerSettings({
      id: "claude-md",
      label: "Claude-MD",
      loadValues: () => [
        { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
      ],
      persistChange: (_scope, _cwd, id, value) => {
        claudeCalls.push(`${id}=${value}`);
      },
    });

    const sections = getRegisteredSettings();

    const flatItems = sections.flatMap((s) =>
      s.loadValues("project", "/tmp").map((item) => ({
        ...item,
        id: `${s.id}.${item.id}`,
      })),
    );

    expect(flatItems.map((i) => i.id)).toEqual(["lsp.enabled", "claude-md.enabled"]);

    const flatId = "claude-md.enabled";
    const dotIndex = flatId.indexOf(".");
    const sectionId = flatId.slice(0, dotIndex);
    const itemId = flatId.slice(dotIndex + 1);
    const section = sections.find((s) => s.id === sectionId);
    expect(section).toBeDefined();
    section?.persistChange("project", "/tmp", itemId, "off");

    expect(lspCalls).toEqual([]);
    expect(claudeCalls).toEqual(["enabled=off"]);
  });
});

describe("openSettingsOverlay", () => {
  it("notifies when no settings are registered", () => {
    const notify = vi.fn();
    const custom = vi.fn();

    openSettingsOverlay({ cwd: "/tmp", ui: { notify, custom } } as never);

    expect(notify).toHaveBeenCalledWith("No settings registered by SuPi extensions", "info");
    expect(custom).not.toHaveBeenCalled();
  });

  it("starts in project scope and reloads settings on Tab", () => {
    const loadScopes: Array<"project" | "global"> = [];

    registerSettings({
      id: "claude-md",
      label: "Claude-MD",
      loadValues: (scope) => {
        loadScopes.push(scope);
        return [{ id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] }];
      },
      persistChange: vi.fn(),
    });

    let component: { handleInput?: (data: string) => boolean } | undefined;
    const requestRender = vi.fn();
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      component = factory(
        { requestRender },
        {
          fg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
        undefined,
        vi.fn(),
      ) as { handleInput?: (data: string) => boolean };
      return Promise.resolve();
    });

    openSettingsOverlay({ cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);

    expect(custom).toHaveBeenCalledOnce();
    expect(loadScopes).toEqual(["project"]);
    expect(component).toBeDefined();
    expect(component?.handleInput?.("\t")).toBe(true);
    expect(loadScopes).toEqual(["project", "global"]);
    expect(requestRender).toHaveBeenCalled();
  });

  it("delegates Escape to the underlying settings list", () => {
    registerSettings({
      id: "claude-md",
      label: "Claude-MD",
      loadValues: () => [
        { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
      ],
      persistChange: vi.fn(),
    });

    let component: { handleInput?: (data: string) => boolean } | undefined;
    const done = vi.fn();
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      component = factory(
        { requestRender: vi.fn() },
        {
          fg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
        undefined,
        done,
      ) as { handleInput?: (data: string) => boolean };
      return Promise.resolve();
    });

    openSettingsOverlay({ cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);

    expect(component?.handleInput?.("\u001b")).toBe(true);
    expect(done).toHaveBeenCalled();
  });
});
