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
    await session.dispose();
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

  it("extracts C declarations without leaking function locals", async () => {
    const items = await outline(
      "sample.c",
      `typedef struct Point { int x, y; } Point;
struct User { const char *name; int age; };
union Value { int integer; double decimal; };
enum State { READY, DONE = 2 };
typedef enum { OFF, ON } Mode;
typedef unsigned long Id;
static int count = 0, total;
int add(int a, int b) { int local = a; return local + b; }
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Point", "struct"],
      ["User", "struct"],
      ["Value", "union"],
      ["State", "enum"],
      ["Mode", "enum"],
      ["Id", "type"],
      ["count", "variable"],
      ["total", "variable"],
      ["add", "function"],
    ]);
    expect(items[0]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["x", "field"],
      ["y", "field"],
    ]);
    expect(items[3]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["READY", "enum-member"],
      ["DONE", "enum-member"],
    ]);
    expect(items[4]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["OFF", "enum-member"],
      ["ON", "enum-member"],
    ]);
    expect(items.some(({ name }) => name === "local")).toBe(false);
  });

  it("extracts C++ namespaces, types, methods, and declarations", async () => {
    const items = await outline(
      "sample.cpp",
      `namespace app {
template <typename T>
class Box { public: T value; T get() const { return value; } };
class Greeter { public: Greeter(); ~Greeter(); void greet() const; int count, total; };
struct Point { int x; int y; };
union Value { int integer; double decimal; };
enum class State { Ready, Done = 2 };
using Id = long;
typedef unsigned Count;
void freeFunction() {}
int globalA = 1, globalB;
}
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([["app", "namespace"]]);
    const members = items[0]?.children ?? [];
    expect(members.map(({ name, kind }) => [name, kind])).toEqual([
      ["Box", "class"],
      ["Greeter", "class"],
      ["Point", "struct"],
      ["Value", "union"],
      ["State", "enum"],
      ["Id", "type"],
      ["Count", "type"],
      ["freeFunction", "function"],
      ["globalA", "variable"],
      ["globalB", "variable"],
    ]);
    expect(members[1]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["Greeter", "method"],
      ["~Greeter", "method"],
      ["greet", "method"],
      ["count", "field"],
      ["total", "field"],
    ]);
  });

  it("keeps C++ declarator names and hoists anonymous namespace declarations", async () => {
    const items = await outline(
      "edge.cpp",
      `class Result {};
Result makeResult() { return {}; }
namespace { void hidden() {} }
class Host { friend void helper(); };
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Result", "class"],
      ["makeResult", "function"],
      ["hidden", "function"],
      ["Host", "class"],
    ]);
    expect(items[3]?.children).toEqual([]);
  });

  it("extracts Java types and their shallow members", async () => {
    const items = await outline(
      "Sample.java",
      `public class Greeter {
  static final int LEFT = 1, RIGHT = 2;
  private String name;
  public Greeter() {}
  public void greet() { int local = 1; }
  static class Nested {}
}
interface Speaker { void speak(); String label(); }
enum State { READY, DONE(2); State() {} void reset() {} }
record Point(int x, int y) { int sum() { return x + y; } }
@interface Marker { String value(); }
@interface Empty {}
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Greeter", "class"],
      ["Speaker", "interface"],
      ["State", "enum"],
      ["Point", "record"],
      ["Marker", "interface"],
      ["Empty", "interface"],
    ]);
    expect(items[0]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["LEFT", "field"],
      ["RIGHT", "field"],
      ["name", "field"],
      ["Greeter", "method"],
      ["greet", "method"],
      ["Nested", "class"],
    ]);
    expect(items[2]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["READY", "enum-member"],
      ["DONE", "enum-member"],
      ["State", "method"],
      ["reset", "method"],
    ]);
    expect(items[3]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["x", "field"],
      ["y", "field"],
      ["sum", "method"],
    ]);
  });

  it("extracts Java module declarations", async () => {
    const items = await outline("module-info.java", "module com.example.app {}\n");
    expect(items).toEqual([expect.objectContaining({ name: "com.example.app", kind: "module" })]);
  });

  it("extracts Kotlin types, objects, functions, properties, and members", async () => {
    const items = await outline(
      "Sample.kt",
      `typealias Id = String
const val TOP = 1
val first = 1
fun hello() { val local = 2 }
class Greeter(val name: String) {
  val count = 1
  constructor(): this("default")
  fun greet() {}
  class Nested
}
interface Speaker { val label: String; fun speak() }
enum class State { READY, DONE }
data class Point(val x: Int, val y: Int)
object Registry { fun register() {} }
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Id", "type"],
      ["TOP", "constant"],
      ["first", "variable"],
      ["hello", "function"],
      ["Greeter", "class"],
      ["Speaker", "interface"],
      ["State", "enum"],
      ["Point", "class"],
      ["Registry", "object"],
    ]);
    expect(items[4]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["name", "field"],
      ["count", "field"],
      ["Greeter", "method"],
      ["greet", "method"],
      ["Nested", "class"],
    ]);
    expect(items[6]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["READY", "enum-member"],
      ["DONE", "enum-member"],
    ]);
    expect(items[7]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["x", "field"],
      ["y", "field"],
    ]);
  });
});
