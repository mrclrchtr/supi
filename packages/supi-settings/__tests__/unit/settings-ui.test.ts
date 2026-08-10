import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@earendil-works/pi-coding-agent")>(
    "@earendil-works/pi-coding-agent",
  );
  return {
    ...actual,
    getSettingsListTheme: () => ({}),
  };
});

import {
  type BoolField,
  type ScopedFieldValue,
  type SettingsSection,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import {
  createInputSubmenu,
  createModelPickerSubmenu,
  openSettingsOverlay,
} from "../../src/api.ts";

const booleanField: BoolField = { kind: "boolean", key: "enabled", label: "Enable" };

function makeSection(overrides: Partial<SettingsSection> = {}): SettingsSection {
  return {
    id: "test",
    label: "Test",
    loadValues: () => [
      {
        field: booleanField,
        displayValue: "on (default)",
        editValue: "on",
        source: "default",
      } satisfies ScopedFieldValue,
    ],
    handleAction: vi.fn(),
    ...overrides,
  };
}

function makePi(sections: SettingsSection[]) {
  return {
    events: {
      emit: vi.fn((channel: string, collector: { add(section: SettingsSection): void }) => {
        expect(channel).toBe(SUPI_SETTINGS_COLLECT_EVENT);
        for (const section of sections) collector.add(section);
      }),
    },
  };
}

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

describe("createInputSubmenu", () => {
  it("calls done with the input value on Enter", () => {
    const done = vi.fn();
    const submenu = createInputSubmenu("hello", "Test Label", done);

    submenu.handleInput("\r");

    expect(done).toHaveBeenCalledWith("hello");
  });

  it("calls done without value on Escape", () => {
    const done = vi.fn();
    const submenu = createInputSubmenu("hello", "Test Label", done);

    submenu.handleInput("\u001b");

    expect(done).toHaveBeenCalledWith();
  });

  it("delegates text input then confirms with updated value", () => {
    const done = vi.fn();
    const submenu = createInputSubmenu("", "Label", done);

    submenu.handleInput("x");
    submenu.handleInput("\r");

    expect(done).toHaveBeenCalledWith("x");
  });

  it("renders label and hint lines", () => {
    const submenu = createInputSubmenu("val", "My Label", vi.fn());

    const lines = submenu.render(80);
    expect(lines[0]).toContain("My Label");
    expect(lines[lines.length - 1]).toContain("enter confirm");
  });
});

describe("createModelPickerSubmenu", () => {
  it("keeps disabled as the default first choice", () => {
    const done = vi.fn();
    const submenu = createModelPickerSubmenu("disabled", done);

    submenu.handleInput("\r");

    expect(done).toHaveBeenCalledWith("disabled");
  });

  it("supports host-owned choices without offering disabled", () => {
    const done = vi.fn();
    const submenu = createModelPickerSubmenu("current", done, undefined, {
      includeDisabled: false,
      staticOptions: [
        {
          value: "current",
          label: "current session model",
          description: "Use the active session model",
        },
      ],
    });

    expect(submenu.render(80).join("\n")).toContain("current session model");
    expect(submenu.render(80).join("\n")).not.toContain("disabled");
    submenu.handleInput("\r");

    expect(done).toHaveBeenCalledWith("current");
  });

  it("keeps only the first static option for each persisted value", () => {
    const done = vi.fn();
    const submenu = createModelPickerSubmenu("disabled", done, undefined, {
      staticOptions: [
        { value: "current", label: "first current" },
        { value: "current", label: "duplicate current" },
        { value: "disabled", label: "host disabled" },
      ],
    });

    const rendered = submenu.render(80).join("\n");
    expect(rendered).toContain("first current");
    expect(rendered).not.toContain("duplicate current");
    expect(rendered).toContain("host disabled");
    expect(rendered).not.toContain("No model selected");
    submenu.handleInput("\r");

    expect(done).toHaveBeenCalledWith("disabled");
  });
});

describe("openSettingsOverlay", () => {
  it("notifies when no settings are contributed", () => {
    const notify = vi.fn();
    const custom = vi.fn();
    const pi = makePi([]);

    openSettingsOverlay(pi as never, { cwd: "/tmp", ui: { notify, custom } } as never);

    expect(notify).toHaveBeenCalledWith("No settings registered by SuPi extensions", "info");
    expect(custom).not.toHaveBeenCalled();
  });

  it("starts in project scope and reloads settings on Tab", () => {
    const loadScopes: Array<"project" | "global"> = [];
    const pi = makePi([
      makeSection({
        loadValues: (scope) => {
          loadScopes.push(scope);
          return [
            {
              field: booleanField,
              displayValue: "on (default)",
              editValue: "on",
              source: "default",
            } satisfies ScopedFieldValue,
          ];
        },
      }),
    ]);

    let component: { handleInput?: (data: string) => boolean } | undefined;
    const requestRender = vi.fn();
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      component = factory({ requestRender }, makeTheme(), undefined, vi.fn()) as {
        handleInput?: (data: string) => boolean;
      };
      return Promise.resolve();
    });

    openSettingsOverlay(pi as never, { cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);

    expect(custom).toHaveBeenCalledOnce();
    expect(loadScopes).toEqual(["project"]);
    expect(component?.handleInput?.("\t")).toBe(true);
    expect(loadScopes).toEqual(["project", "global"]);
    expect(requestRender).toHaveBeenCalled();
  });

  it("keeps Tab in an open setting menu", () => {
    const loadScopes: Array<"project" | "global"> = [];
    const pi = makePi([
      makeSection({
        loadValues: (scope) => {
          loadScopes.push(scope);
          return [
            {
              field: booleanField,
              displayValue: "on (default)",
              editValue: "on",
              source: "default",
            } satisfies ScopedFieldValue,
          ];
        },
      }),
    ]);
    let component: { handleInput?: (data: string) => boolean } | undefined;
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      component = factory(
        { requestRender: vi.fn() },
        makeTheme(),
        undefined,
        vi.fn(),
      ) as typeof component;
      return Promise.resolve();
    });

    openSettingsOverlay(pi as never, { cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);
    component?.handleInput?.("\r");
    component?.handleInput?.("\t");

    expect(loadScopes).toEqual(["project"]);
  });

  it("delegates Escape to close", () => {
    const pi = makePi([makeSection()]);
    let component: { handleInput?: (data: string) => boolean } | undefined;
    const done = vi.fn();
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      component = factory({ requestRender: vi.fn() }, makeTheme(), undefined, done) as {
        handleInput?: (data: string) => boolean;
      };
      return Promise.resolve();
    });

    openSettingsOverlay(pi as never, { cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);

    expect(component?.handleInput?.("\u001b")).toBe(true);
    expect(done).toHaveBeenCalled();
  });

  it("renders duplicate contribution warnings in the overlay status line", () => {
    const pi = makePi([makeSection({ label: "First" }), makeSection({ label: "Second" })]);
    let _component: { render(width: number): string[] } | undefined;
    const custom = vi.fn((factory: (...args: unknown[]) => unknown) => {
      _component = factory({ requestRender: vi.fn() }, makeTheme(), undefined, vi.fn()) as {
        render(width: number): string[];
      };
      return Promise.resolve();
    });

    openSettingsOverlay(pi as never, { cwd: "/tmp", ui: { custom, notify: vi.fn() } } as never);

    expect(custom).toHaveBeenCalledOnce();
  });
});
