import { describe, expect, it } from "vitest";
import { countChangedLines } from "../../src/parser.ts";

describe("countChangedLines", () => {
  it.each([
    { name: "empty text", oldText: "", newText: "", added: 0, removed: 0 },
    { name: "one new line", oldText: "", newText: "first", added: 1, removed: 0 },
    { name: "one removed line", oldText: "first", newText: "", added: 0, removed: 1 },
    { name: "one replacement", oldText: "old\n", newText: "new\n", added: 1, removed: 1 },
    {
      name: "one appended line",
      oldText: "first\n",
      newText: "first\nsecond\n",
      added: 1,
      removed: 0,
    },
    {
      name: "a final newline change",
      oldText: "same",
      newText: "same\n",
      added: 1,
      removed: 1,
    },
  ])("counts $name", ({ oldText, newText, added, removed }) => {
    expect(countChangedLines(oldText, newText)).toEqual({ added, removed });
  });
});
