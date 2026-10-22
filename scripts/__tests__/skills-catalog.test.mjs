import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

it("loads every catalog skill without frontmatter diagnostics", () => {
  const inventory = JSON.parse(
    readFileSync(join(root, "packages/supi-skill-patches/upstream.json"), "utf8"),
  );
  const expectedPaths = Object.keys(inventory.includedGroups).flatMap((group) =>
    inventory.groups[group].map((name) => join(root, "skills", group, name, "SKILL.md")),
  );
  const { skills, diagnostics } = loadSkillsFromDir({
    dir: join(root, "skills"),
    source: "project",
  });

  expect(diagnostics).toEqual([]);
  expect(skills.map((skill) => skill.filePath).sort()).toEqual(expectedPaths.sort());
});

it("keeps project-local skill links pointed at existing skills", () => {
  const directory = join(root, ".pi/skills");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    expect(existsSync(join(directory, entry.name, "SKILL.md")), entry.name).toBe(true);
  }
});
