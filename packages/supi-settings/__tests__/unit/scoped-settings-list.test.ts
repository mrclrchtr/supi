import type {
  BoolField,
  ScopedFieldValue,
  SettingsApplyResult,
  SettingsModule,
} from "@mrclrchtr/supi-core/settings";
import { describe, expect, it, vi } from "vitest";
import { ScopedSettingsList } from "../../src/ui/scoped-settings-list.ts";
import type { LoadedSettingsModule } from "../../src/ui/settings-module-reader.ts";

const field: BoolField = { kind: "boolean", key: "enabled", label: "Enabled" };

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function settingsRow(fieldOverride: BoolField = field): ScopedFieldValue {
  return {
    field: fieldOverride,
    displayValue: "on (project)",
    editValue: "on",
    source: "project",
    inheritanceSource: "default",
  };
}

function makeModule(rows: ScopedFieldValue[] = [settingsRow()]): SettingsModule {
  return {
    id: "test",
    label: "Test",
    read: vi.fn(async () => ({ rows })),
    apply: vi.fn(async () => ({})),
  };
}

function loaded(module: SettingsModule, rows: ScopedFieldValue[]): LoadedSettingsModule {
  return { module, snapshot: { rows } };
}

function makeList(module: SettingsModule, rows: ScopedFieldValue[], requestRender = vi.fn()) {
  return new ScopedSettingsList(
    [module],
    [loaded(module, rows)],
    "project",
    "/repo",
    undefined,
    makeTheme() as never,
    { requestRender },
    vi.fn(),
  );
}

describe("ScopedSettingsList", () => {
  it("groups settings by module and shows the selected description", () => {
    const describedField: BoolField = {
      ...field,
      description: "Controls the test feature",
    };
    const alpha = { ...makeModule(), id: "alpha", label: "Alpha" };
    const beta = { ...makeModule(), id: "beta", label: "Beta" };
    const list = new ScopedSettingsList(
      [alpha, beta],
      [loaded(alpha, [settingsRow(describedField)]), loaded(beta, [settingsRow()])],
      "project",
      "/repo",
      undefined,
      makeTheme() as never,
      { requestRender: vi.fn() },
      vi.fn(),
    );

    const rendered = list.render(80).join("\n");

    expect(rendered).toContain("  Alpha\n  → Enabled");
    expect(rendered).toContain("  Beta\n    Enabled");
    expect(rendered).not.toContain("Alpha: Enabled");
    expect(rendered).toContain("Controls the test feature");
  });

  it("awaits asynchronous persistence before reading a fresh snapshot", async () => {
    let finish: (() => void) | undefined;
    const rows = [settingsRow()];
    const module: SettingsModule = {
      ...makeModule(rows),
      apply: vi.fn(
        () =>
          new Promise<SettingsApplyResult>((resolve) => {
            finish = () => resolve({});
          }),
      ),
    };
    const list = makeList(module, rows);

    list.handleInput(" ");
    expect(module.read).not.toHaveBeenCalled();
    finish?.();

    await vi.waitFor(() => expect(module.read).toHaveBeenCalledOnce());
  });

  it("requests a re-render after delegated submenu input", () => {
    const requestRender = vi.fn();
    const module = makeModule();
    const list = makeList(module, [settingsRow()], requestRender);

    list.handleInput("\r");
    requestRender.mockClear();
    list.render(80);

    list.handleInput("\u001b[B");

    expect(requestRender).toHaveBeenCalled();
  });
});
