import { describe, expect, it } from "vitest";
import { buildActionMenu } from "../../../src/settings/settings-action-menu.ts";
import type { ScopedFieldValue } from "../../../src/settings/settings-schema.ts";

describe("buildActionMenu", () => {
  it("offers edit plus source-aware delete actions for custom project overrides", () => {
    const field: ScopedFieldValue = {
      field: {
        kind: "custom",
        key: "nested",
        label: "Nested",
        resolve: () => ({ displayValue: "typescript", source: "project" }),
        submenu: () => ({ render: () => [], invalidate: () => {} }),
        persist: () => {},
      },
      displayValue: "typescript (project)",
      editValue: "typescript",
      source: "project",
      inheritanceSource: "global",
    };

    expect(buildActionMenu(field, "project")).toEqual([
      { value: "edit", label: "Edit…" },
      { value: "inherit", label: "Inherit from global" },
    ]);
  });
});
