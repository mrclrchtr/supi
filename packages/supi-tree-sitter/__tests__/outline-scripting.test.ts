import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession, type OutlineItem } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-outline-scripting-"));
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

describe("scripting-language outline extraction", () => {
  it("extracts Ruby constants, modules, classes, and methods without local assignments", async () => {
    const items = await outline(
      "sample.gemspec",
      `VALUE, SECOND = 1, 2
client.timeout = 5
items[0] = :ignored
Config::VALUE = 1
FIRST_CHAIN = SECOND_CHAIN = 2
PAREN_FIRST = (PAREN_SECOND = 3)
records.each do |record; scratch|
  scratch = record.to_s
end
module Outer
  scratch = 0
  CONST = 2
  class Greeter
    temporary = 0
    @defaults = {}
    attr_reader :name, :email
    attr_writer :token
    attr_accessor :status
    Registrar.attr_reader :external
    def greet
      local = 1
    end
    def self.build = new
    class << self
      def reset; end
    end
    private def secret; end
    alias old_greet greet
  end
  module_function def module_build; end
  def helper; end
end
module Empty
end
def top_level
  local = 2
end
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["VALUE", "constant"],
      ["SECOND", "constant"],
      ["Config::VALUE", "constant"],
      ["FIRST_CHAIN", "constant"],
      ["SECOND_CHAIN", "constant"],
      ["PAREN_FIRST", "constant"],
      ["PAREN_SECOND", "constant"],
      ["Outer", "module"],
      ["Empty", "module"],
      ["top_level", "function"],
    ]);
    expect(items[7]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["CONST", "constant"],
      ["Greeter", "class"],
      ["module_build", "method"],
      ["helper", "method"],
    ]);
    expect(items[7]?.children?.[1]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["@defaults", "variable"],
      ["name", "method"],
      ["email", "method"],
      ["token=", "method"],
      ["status", "method"],
      ["status=", "method"],
      ["greet", "method"],
      ["build", "method"],
      ["reset", "method"],
      ["secret", "method"],
      ["old_greet", "method"],
    ]);
    expect(items[8]?.children).toEqual([]);
  });

  it("extracts shell variables, constants, and functions without function locals", async () => {
    const items = await outline(
      "sample.ksh",
      `GLOBAL=1
ARRAY=(one two)
items[0]=ignored
map[key]=ignored
TEMP_ONLY=1 run_task
( SUBSHELL_ONLY=1; scoped_helper() { :; }; )
echo "$(INNER=1; echo x)"
BACKGROUND=1 &
background_fn() { :; } &
{ GROUPED=1; } &
declare -p OPTIONAL
declare -F inspected_function
declare PLAIN
export EXPORTED=2
readonly READ_ONLY=3 ALSO_READ_ONLY
declare -r DECLARED=4
foo() {
  local inside=1
  nested=2
}
function bar { echo hi; }
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["GLOBAL", "variable"],
      ["ARRAY", "variable"],
      ["PLAIN", "variable"],
      ["EXPORTED", "variable"],
      ["READ_ONLY", "constant"],
      ["ALSO_READ_ONLY", "constant"],
      ["DECLARED", "constant"],
      ["foo", "function"],
      ["bar", "function"],
    ]);
    expect(items.some(({ name }) => name === "inside" || name === "nested")).toBe(false);
  });

  it("extracts R assignments and named functions without function locals", async () => {
    const items = await outline(
      "sample.r",
      `VALUE <- 1
a <- b <- 2
outer <- (inner <- 3)
add <- function(x, y) {
  local_value <- x + y
}
first_fn <- second_fn <- function() 1
paren_fn <- (nested_fn <- function() 1)
3 -> right
(function(x) x) -> identity
print.person <- function(x, ...) x
function(x) x
\\(x) x
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["VALUE", "variable"],
      ["a", "variable"],
      ["b", "variable"],
      ["outer", "variable"],
      ["inner", "variable"],
      ["add", "function"],
      ["first_fn", "function"],
      ["second_fn", "function"],
      ["paren_fn", "function"],
      ["nested_fn", "function"],
      ["right", "variable"],
      ["identity", "function"],
      ["print.person", "function"],
    ]);
    expect(items.some(({ name }) => name === "local_value" || name === "function")).toBe(false);
  });
});
