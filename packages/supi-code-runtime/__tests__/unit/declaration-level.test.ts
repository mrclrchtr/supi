import { describe, expect, it } from "vitest";
import { childDeclarationLevel } from "../../src/declaration-level.ts";

describe("childDeclarationLevel", () => {
  it.each([
    // [parent kind, parent level, child kind, expected]
    ["Class", "top-level", "Method", "member"],
    ["interface", "top-level", "property", "member"],
    ["Enum", "top-level", "EnumMember", "member"],
    ["Namespace", "top-level", "Variable", "member"],
    ["Function", "top-level", "Variable", "local"],
    ["Method", "member", "Variable", "local"],
    ["Constructor", "member", "Variable", "local"],
    // A variable holds either an object literal (members) or a function (locals).
    ["Variable", "top-level", "Property", "member"],
    ["constant", "top-level", "method", "member"],
    ["Variable", "top-level", "Variable", "local"],
    ["Variable", "top-level", "Function", "local"],
    // Once local, always local: a class declared inside a function body.
    ["Class", "local", "Method", "local"],
  ] as const)("%s (%s) containing %s is %s", (kind, level, childKind, expected) => {
    expect(childDeclarationLevel({ kind, level }, childKind)).toBe(expected);
  });
});
