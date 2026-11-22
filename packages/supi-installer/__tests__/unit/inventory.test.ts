import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createContext, readInventory } from "../../src/inventory.mjs";
import { fixture, writeJson } from "../helpers/fixture.js";

const roots: string[] = [];
function setup() {
  const files = fixture();
  roots.push(files.root);
  return { ...files, context: createContext(files) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("installer inventory", () => {
  it("reads direct declarations in both scopes without losing pins or filters", () => {
    const { context, agentDir, project } = setup();
    const filtered = { source: "npm:@mrclrchtr/supi-web@8.0.0", extensions: [], autoload: false };
    writeJson(join(agentDir, "settings.json"), { packages: [filtered] });
    writeJson(join(project, ".pi/settings.json"), { packages: ["npm:@mrclrchtr/supi-context"] });
    const inventory = readInventory(context);
    expect(inventory.entries.global).toEqual([filtered]);
    expect(inventory.entries.project).toEqual(["npm:@mrclrchtr/supi-context"]);
    expect(inventory.blocked.global).toEqual([]);
  });

  it("treats missing settings as empty, but requires saved trust even for global work", () => {
    const { context, agentDir } = setup();
    expect(readInventory(context).entries).toEqual({ project: [], global: [] });
    writeJson(join(agentDir, "trust.json"), {});
    expect(() => readInventory(context)).toThrow(/saved Pi trust approval/);
  });

  it("honors a nearer denial and ignores a default trust setting", () => {
    const { context, agentDir, root, project } = setup();
    writeJson(join(agentDir, "trust.json"), { [root]: true, [project]: false });
    writeJson(join(agentDir, "settings.json"), { defaultProjectTrust: "always" });
    expect(() => readInventory(context)).toThrow(/\/trust/);
  });

  it("uses canonical project trust through a directory alias and file URL", () => {
    const { root, project, agentDir } = setup();
    const alias = join(root, "alias");
    symlinkSync(project, alias, process.platform === "win32" ? "junction" : "dir");
    const context = createContext({ project: pathToFileURL(alias).href, agentDir });
    expect(context.project).toBe(project);
    expect(readInventory(context).entries.project).toEqual([]);
  });

  it("accepts BOM documents and skips null trust decisions", () => {
    const { context, project, agentDir, root } = setup();
    writeFileSync(
      join(agentDir, "trust.json"),
      `\uFEFF${JSON.stringify({ [project]: null, [root]: true })}`,
    );
    writeFileSync(
      join(agentDir, "settings.json"),
      `\uFEFF${JSON.stringify({ packages: ["npm: @mrclrchtr/supi-web@>=8 <10 "] })}`,
    );
    expect(readInventory(context).unmanaged.global).toEqual([]);
  });

  it("refuses overlapping global and project settings", () => {
    const { project } = setup();
    expect(() => createContext({ project, agentDir: join(project, ".pi") })).toThrow(/same file/);
  });

  it("rejects malformed settings, package fields, and trust data", () => {
    const { context, agentDir } = setup();
    const settings = join(agentDir, "settings.json");
    writeFileSync(settings, "{");
    expect(() => readInventory(context)).toThrow(/settings.json/);
    writeJson(settings, { packages: [{ source: "npm:example", extensions: false }] });
    expect(() => readInventory(context)).toThrow(/extensions/);
    writeJson(settings, {});
    writeJson(join(agentDir, "trust.json"), { invalid: "yes" });
    expect(() => readInventory(context)).toThrow(/trust.json/);
  });
});
