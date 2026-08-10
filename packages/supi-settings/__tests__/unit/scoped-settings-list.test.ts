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
    const alphaProfile = {
      ...makeModule(),
      id: "alpha-profile-explore",
      label: "Alpha",
      subsection: "explore",
    };
    const profileRow = settingsRow({ ...field, key: "model", label: "Model" });
    const list = new ScopedSettingsList(
      [alpha, beta, alphaProfile],
      [
        loaded(alpha, [settingsRow(describedField)]),
        loaded(beta, [settingsRow()]),
        loaded(alphaProfile, [profileRow]),
      ],
      "project",
      "/repo",
      undefined,
      makeTheme() as never,
      { requestRender: vi.fn() },
      vi.fn(),
    );

    const rendered = list.render(80).join("\n");

    expect(rendered).toContain("  Alpha\n  → Enabled");
    expect(rendered).toContain("    explore\n      Model");
    expect(rendered).toContain("  Beta\n    Enabled");
    expect(rendered).not.toContain("Alpha: Enabled");
    expect(rendered).toContain("Controls the test feature");
  });

  it("keeps its height stable when group headers enter the viewport", () => {
    const alphaRows = Array.from({ length: 11 }, (_, index) =>
      settingsRow({ ...field, key: `alpha-${index}`, label: `Alpha ${index}` }),
    );
    const betaRows = [settingsRow({ ...field, key: "beta", label: "Beta" })];
    const alpha = { ...makeModule(alphaRows), id: "alpha", label: "Alpha section" };
    const beta = {
      ...makeModule(betaRows),
      id: "beta",
      label: "Beta section",
      subsection: "explore",
    };
    const list = new ScopedSettingsList(
      [alpha, beta],
      [loaded(alpha, alphaRows), loaded(beta, betaRows)],
      "project",
      "/repo",
      undefined,
      makeTheme() as never,
      { requestRender: vi.fn() },
      vi.fn(),
    );

    const firstLines = list.render(80);
    for (let index = 0; index < 7; index++) list.handleInput("\u001b[B");
    const laterLines = list.render(80);

    expect(firstLines.join("\n")).not.toContain("Beta section");
    expect(laterLines.join("\n")).toContain("Beta section\n    explore");
    expect(laterLines).toHaveLength(firstLines.length);
  });

  it("keeps its height stable and limits long descriptions", () => {
    const rows = [
      settingsRow({
        ...field,
        key: "described",
        label: "Described",
        description:
          "This description has enough words to use more than four lines in a narrow menu and must end with an ellipsis.",
      }),
      settingsRow({ ...field, key: "plain", label: "Plain" }),
    ];
    const list = makeList(makeModule(rows), rows);

    const describedLines = list.render(30);
    list.handleInput("\u001b[B");
    const plainLines = list.render(30);

    expect(describedLines.join("\n")).toContain("…");
    expect(plainLines).toHaveLength(describedLines.length);
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
