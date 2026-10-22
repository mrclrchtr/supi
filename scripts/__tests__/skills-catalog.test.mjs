import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

it("loads every catalog skill without frontmatter diagnostics", () => {
  const marketplace = JSON.parse(
    readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"),
  );
  const expectedPaths = marketplace.plugins.flatMap((plugin) =>
    plugin.skills.map((path) => join(root, path, "SKILL.md")),
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
