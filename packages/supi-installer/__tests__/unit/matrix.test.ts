import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { catalog } from "../../src/catalog.mjs";
import { createContext, readInventory } from "../../src/inventory.mjs";
import { applyPreset, createMatrix, getPlan, toggleCell } from "../../src/matrix.mjs";
import { fixture, writeJson } from "../helpers/fixture.js";

const roots: string[] = [];
function setup(global: unknown[] = [], project: unknown[] = []) {
  const files = fixture();
  roots.push(files.root);
  writeJson(join(files.agentDir, "settings.json"), { packages: global });
  writeJson(join(files.project, ".pi/settings.json"), { packages: project });
  return { ...files, inventory: readInventory(createContext(files)) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Installation Matrix", () => {
  it("keeps both declarations independent and preserves unchanged filtered entries", () => {
    const { inventory } = setup([{ source: "npm:@mrclrchtr/supi-web@8.0.0", extensions: [] }]);
    const matrix = createMatrix(inventory);
    const web = matrix.rows.findIndex((row) => row.item.name === "supi-web");
    expect(matrix.rows[web]?.selected).toEqual({ global: true, project: false });
    expect(getPlan(matrix)).toEqual([]);
    toggleCell(matrix, web, "project");
    expect(getPlan(matrix)).toEqual([
      { action: "install", scope: "project", name: "supi-web", source: "npm:@mrclrchtr/supi-web" },
    ]);
    toggleCell(matrix, web, "global");
    expect(getPlan(matrix)[1]).toEqual({
      action: "remove",
      scope: "global",
      name: "supi-web",
      source: "npm:@mrclrchtr/supi-web@8.0.0",
    });
  });

  it("replaces only the focused column with exactly the recommended selection", () => {
    const { inventory } = setup(["npm:@mrclrchtr/supi-agent"], ["npm:@mrclrchtr/supi-debug"]);
    const matrix = createMatrix(inventory);
    applyPreset(matrix, "project", "recommended");
    expect(matrix.rows.filter((row) => row.selected.project).map((row) => row.item.name)).toEqual([
      "supi-ask-user",
      "supi-code-intelligence",
      "supi-context",
      "supi-extras",
      "supi-prompt-suggestions",
      "supi-settings",
      "supi-skills",
      "supi-web",
    ]);
    expect(matrix.rows.filter((row) => row.selected.global).map((row) => row.item.name)).toEqual([
      "supi-agent",
    ]);
    applyPreset(matrix, "project", "all");
    expect(matrix.rows.filter((row) => row.selected.project)).toHaveLength(14);
  });

  it("allows removal-only undo but never an obsolete addition", () => {
    const { inventory } = setup(["npm:@mrclrchtr/supi-rtk"]);
    const matrix = createMatrix(inventory);
    const old = matrix.rows.findIndex((row) => row.item.name === "supi-rtk");
    expect(toggleCell(matrix, old, "project")).toBe(false);
    toggleCell(matrix, old, "global");
    expect(getPlan(matrix)[0]?.action).toBe("remove");
    toggleCell(matrix, old, "global");
    expect(getPlan(matrix)).toEqual([]);
  });

  it.each([
    "git:github.com/mrclrchtr/supi@main",
    "https://github.com/mrclrchtr/supi.git",
    "ssh://git@github.com/mrclrchtr/supi.git",
    "git://github.com/mrclrchtr/supi.git",
    "https://github.com/mrclrchtr/supi.git#main",
    "git:mrclrchtr/supi",
    "git:git@github.com:mrclrchtr/supi.git@main",
    "npm:@mrclrchtr/supi@1.0.0",
  ])("blocks a recognized root source: %s", (source) => {
    const { inventory } = setup([source]);
    expect(inventory.blocked.global).toEqual([source]);
    const matrix = createMatrix(inventory);
    applyPreset(matrix, "global", "all");
    expect(getPlan(matrix)).toEqual([]);
    applyPreset(matrix, "project", "all");
    expect(getPlan(matrix)).toHaveLength(14);
  });

  it("recognizes local package manifests without executing code", () => {
    const files = fixture();
    roots.push(files.root);
    writeJson(join(files.root, "checkout/package.json"), { name: "@mrclrchtr/supi-workspace" });
    writeJson(join(files.project, ".pi/settings.json"), { packages: ["../../checkout"] });
    const inventory = readInventory(createContext(files));
    expect(inventory.blocked.project).toEqual(["../../checkout"]);
  });

  it("preserves unknown packages and rejects duplicate managed declarations", () => {
    const { inventory, agentDir } = setup(["npm:@other/tool", "npm:@mrclrchtr/supi-future"]);
    expect(inventory.unmanaged.global).toHaveLength(2);
    applyPreset(createMatrix(inventory), "global", "clear");
    writeJson(join(agentDir, "settings.json"), {
      packages: ["npm:@mrclrchtr/supi-web", "npm:@mrclrchtr/supi-web@8"],
    });
    expect(() => readInventory(inventory.context)).toThrow(/Duplicate/);
  });

  it("covers workspace extensions without offering Infrastructure Packages", () => {
    const root = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
    );
    const names = root.pi.extensions
      .map((path: string) => path.split("/")[2])
      .sort((a: string, b: string) => a.localeCompare(b));
    expect(
      catalog
        .filter((item) => !item.obsolete)
        .map((item) => item.name)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(names);
    expect(catalog.find((item) => item.name === "supi-core")).toBeUndefined();
  });
});
