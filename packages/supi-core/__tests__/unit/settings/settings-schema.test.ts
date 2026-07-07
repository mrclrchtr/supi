import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { SettingsSection } from "../../../src/settings/settings-registry.ts";
import type {
  BoolField,
  EnumField,
  NumberField,
  StringListField,
} from "../../../src/settings/settings-schema.ts";
import {
  formatEditValue,
  formatValue,
  parseTypedValue,
  registerDeclarativeSettings,
  resolveValue,
  sourceBadge,
} from "../../../src/settings/settings-schema.ts";

// ── resolveValue ───────────────────────────────────────────────────────────

describe("resolveValue", () => {
  const defaults = { enabled: true, severity: 1, tags: [] };

  it("resolves from project scope when the key is in project raw config", () => {
    const result = resolveValue("enabled", defaults, { enabled: false }, null, "project");
    expect(result).toEqual({ value: false, source: "project" });
  });

  it("falls back to global when project scope has no key but global does", () => {
    const result = resolveValue("severity", defaults, {}, { severity: 3 }, "project");
    expect(result).toEqual({ value: 3, source: "global" });
  });

  it("falls back to defaults when neither project nor global have the key", () => {
    const result = resolveValue("tags", defaults, {}, {}, "project");
    expect(result).toEqual({ value: [], source: "default" });
  });

  it("skips global entirely in global scope", () => {
    const result = resolveValue("severity", defaults, { severity: 4 }, { severity: 3 }, "global");
    // global scope: check global raw only, then defaults
    expect(result).toEqual({ value: 3, source: "global" });
  });

  it("falls back to defaults in global scope when global has no key", () => {
    const result = resolveValue("enabled", defaults, null, {}, "global");
    expect(result).toEqual({ value: true, source: "default" });
  });

  it("handles null raw configs gracefully", () => {
    const result = resolveValue("enabled", defaults, null, null, "project");
    expect(result).toEqual({ value: true, source: "default" });
  });
});

// ── sourceBadge ────────────────────────────────────────────────────────────

describe("sourceBadge", () => {
  it("appends (project) badge", () => {
    expect(sourceBadge("on", "project")).toBe("on (project)");
  });

  it("appends (global) badge", () => {
    expect(sourceBadge("off", "global")).toBe("off (global)");
  });

  it("appends (default) badge", () => {
    expect(sourceBadge("30", "default")).toBe("30 (default)");
  });
});

// ── formatValue ────────────────────────────────────────────────────────────

describe("formatValue", () => {
  const boolField: BoolField = { kind: "boolean", key: "enabled", label: "Enabled" };

  it("formats boolean true as 'on'", () => {
    expect(formatValue(true, boolField)).toBe("on");
  });

  it("formats boolean false as 'off'", () => {
    expect(formatValue(false, boolField)).toBe("off");
  });

  it("formats number values", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(formatValue(30, field)).toBe("30");
  });

  it("formats null number as empty string", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(formatValue(null, field)).toBe("");
  });

  it("formats stringList array", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(formatValue(["a.ts", "b.ts"], field)).toBe("a.ts, b.ts");
  });

  it("formats empty stringList as 'none'", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(formatValue([], field)).toBe("none");
  });

  it("formats enum values as string", () => {
    const field: EnumField = {
      kind: "enum",
      key: "level",
      label: "Level",
      values: ["low", "high"],
    };
    expect(formatValue("high", field)).toBe("high");
  });
});

// ── formatEditValue ────────────────────────────────────────────────────────

describe("formatEditValue", () => {
  it("uses an empty editor value for empty string lists", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(formatValue([], field)).toBe("none");
    expect(formatEditValue([], field)).toBe("");
  });

  it("uses comma-separated editor text for populated string lists", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(formatEditValue(["a.ts", "b.ts"], field)).toBe("a.ts, b.ts");
  });
});

// ── parseTypedValue ────────────────────────────────────────────────────────

describe("parseTypedValue", () => {
  const boolField: BoolField = { kind: "boolean", key: "enabled", label: "Enabled" };

  it("parses 'on' to true for boolean", () => {
    expect(parseTypedValue("on", boolField)).toBe(true);
  });

  it("parses 'off' to false for boolean", () => {
    expect(parseTypedValue("off", boolField)).toBe(false);
  });

  it("parses valid number string", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(parseTypedValue("30", field)).toBe(30);
  });

  it("throws on zero for number input", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(() => parseTypedValue("0", field)).toThrow("positive integer");
  });

  it("throws on non-numeric number input", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(() => parseTypedValue("abc", field)).toThrow(
      'Invalid value for "Timeout": "abc". Enter a positive integer.',
    );
  });

  it("throws on partially numeric number input", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(() => parseTypedValue("30abc", field)).toThrow("Invalid value");
    expect(() => parseTypedValue("1.5", field)).toThrow("Invalid value");
  });

  it("throws on negative number input", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(() => parseTypedValue("-5", field)).toThrow(
      'Invalid value for "Timeout": "-5". Enter a positive integer.',
    );
  });

  it("throws on empty string for number", () => {
    const field: NumberField = { kind: "number", key: "timeout", label: "Timeout" };
    expect(() => parseTypedValue("", field)).toThrow("Invalid value");
  });

  it("parses comma-separated stringList", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(parseTypedValue("a.ts, b.ts , c.ts", field)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("parses empty stringList to empty array", () => {
    const field: StringListField = {
      kind: "stringList",
      key: "files",
      label: "Files",
    };
    expect(parseTypedValue("", field)).toEqual([]);
  });

  it("parses enum values as strings", () => {
    const field: EnumField = {
      kind: "enum",
      key: "level",
      label: "Level",
      values: ["low", "high"],
    };
    expect(parseTypedValue("high", field)).toBe("high");
  });
});

// ── registerDeclarativeSettings integration ───────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-settings-schema-test-"));
}

function makePi() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on(channel: string, handler: (data: unknown) => void) {
        const list = handlers.get(channel) ?? [];
        list.push(handler);
        handlers.set(channel, list);
        return () => list.splice(list.indexOf(handler), 1);
      },
      emit(channel: string, data: unknown) {
        for (const handler of handlers.get(channel) ?? []) handler(data);
      },
    },
    on() {},
  };
}

function collectOnlySection(pi: ReturnType<typeof makePi>): SettingsSection {
  let captured: SettingsSection | undefined;
  pi.events.emit("supi:settings:collect", {
    add(section: SettingsSection) {
      captured = section;
    },
  });
  if (!captured) throw new Error("No settings section collected");
  return captured;
}

describe("registerDeclarativeSettings", () => {
  it("keeps display and edit values separate for empty string lists", () => {
    const tmpDir = makeTempDir();
    try {
      const pi = makePi();
      registerDeclarativeSettings(pi as never, {
        homeDir: tmpDir,
        id: "test",
        label: "Test",
        section: "test",
        defaults: { tags: [] },
        fields: [{ kind: "stringList", key: "tags", label: "Tags" }],
      });

      const [value] = collectOnlySection(pi).loadValues("project", tmpDir);

      expect(value?.displayValue).toBe("none (default)");
      expect(value?.editValue).toBe("");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reports typed stored values after declarative persistence", () => {
    const tmpDir = makeTempDir();
    try {
      const changes: unknown[] = [];
      const pi = makePi();
      registerDeclarativeSettings(pi as never, {
        homeDir: tmpDir,
        id: "test",
        label: "Test",
        section: "test",
        defaults: { tags: [] },
        fields: [{ kind: "stringList", key: "tags", label: "Tags" }],
        afterPersist: (change) => changes.push(change),
      });

      collectOnlySection(pi).handleAction("project", tmpDir, "tags", {
        kind: "set",
        value: "",
      });

      expect(changes).toEqual([
        expect.objectContaining({
          action: "set",
          storedValue: [],
          effectiveValue: [],
          effectiveSource: "project",
        }),
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reports custom-field afterPersist changes", () => {
    const changes: unknown[] = [];
    const pi = makePi();
    registerDeclarativeSettings(pi as never, {
      id: "custom",
      label: "Custom",
      section: "custom",
      defaults: {},
      fields: [
        {
          kind: "custom",
          key: "nested",
          label: "Nested",
          resolve: () => ({ displayValue: "saved", source: "project" }),
          persist: () => {},
        },
      ],
      afterPersist: (change) => changes.push(change),
    });

    collectOnlySection(pi).handleAction("project", "/repo", "nested", {
      kind: "set",
      value: "saved",
    });

    expect(changes).toEqual([
      expect.objectContaining({
        action: "set",
        storedValue: "saved",
        effectiveValue: "saved",
        effectiveSource: "project",
      }),
    ]);
  });
});
