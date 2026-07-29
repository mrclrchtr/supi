import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession, type OutlineItem } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-outline-polyglot-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

async function outline(file: string, source: string): Promise<OutlineItem[]> {
  writeFileSync(join(cwd, file), source);
  const session = createTreeSitterSession(cwd);
  try {
    const result = await session.outline(file);
    expect(result.kind).toBe("success");
    return result.kind === "success" ? result.data : [];
  } finally {
    session.dispose();
  }
}

describe("polyglot outline extraction", () => {
  it("extracts Python declarations and class methods without local declarations", async () => {
    const items = await outline(
      "sample.py",
      `VALUE = 1
CHAIN_A = CHAIN_B = 2
LEFT, RIGHT = (3, 4)
class Greeter:
    @property
    def greeting(self):
        return "hi"

def hello():
    local = 1
    return Greeter()
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["VALUE", "variable"],
      ["CHAIN_A", "variable"],
      ["CHAIN_B", "variable"],
      ["LEFT", "variable"],
      ["RIGHT", "variable"],
      ["Greeter", "class"],
      ["hello", "function"],
    ]);
    expect(items[5]?.children).toEqual([
      expect.objectContaining({ name: "greeting", kind: "method" }),
    ]);
    expect(items.some(({ name }) => name === "local")).toBe(false);
  });

  it("extracts Rust types, functions, and nested implementation methods", async () => {
    const items = await outline(
      "sample.rs",
      `pub struct Greeter { value: i32 }
pub union Value { integer: i32, decimal: f32 }
pub enum State { Ready, Done(i32) }
pub trait Speak { fn speak(&self); }
impl Greeter { pub fn greet(&self) {} }
impl Speak for Greeter { fn speak(&self) {} }
pub fn hello() {}
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Greeter", "struct"],
      ["Value", "union"],
      ["State", "enum"],
      ["Speak", "interface"],
      ["Greeter", "implementation"],
      ["Speak for Greeter", "implementation"],
      ["hello", "function"],
    ]);
    expect(items[0]?.children).toEqual([expect.objectContaining({ name: "value", kind: "field" })]);
    expect(items[1]?.children).toEqual([
      expect.objectContaining({ name: "integer", kind: "field" }),
      expect.objectContaining({ name: "decimal", kind: "field" }),
    ]);
    expect(items[4]?.children).toEqual([
      expect.objectContaining({ name: "greet", kind: "method" }),
    ]);
  });

  it("extracts Go types, functions, methods, and grouped declarations", async () => {
    const items = await outline(
      "sample.go",
      `package sample
var First, Second int
const Left, Right = 1, 2
type (
  Greeter struct { X, Y int }
  Speaker interface { Speak() string }
)
type ID = string
func (g *Greeter) Greet() {}
func Hello() {}
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["First", "variable"],
      ["Second", "variable"],
      ["Left", "constant"],
      ["Right", "constant"],
      ["Greeter", "struct"],
      ["Speaker", "interface"],
      ["ID", "type"],
      ["Greet", "method"],
      ["Hello", "function"],
    ]);
    expect(items[4]?.children).toEqual([
      expect.objectContaining({ name: "X", kind: "field" }),
      expect.objectContaining({ name: "Y", kind: "field" }),
    ]);
    expect(items[5]?.children).toEqual([
      expect.objectContaining({ name: "Speak", kind: "method" }),
    ]);
  });
});
