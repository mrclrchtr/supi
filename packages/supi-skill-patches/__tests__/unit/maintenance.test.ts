import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePatchText, validatePatchBundle } from "../../src/patch-bundle.ts";
import { validateSkillMirror } from "../../src/skill-mirror.ts";

const root = join(import.meta.dirname, "../../../..");

describe("skill patch maintenance", () => {
  it("normalizes patch text to match the repo whitespace hook", () => {
    expect(
      normalizePatchText("diff --git a/f b/f\nindex 1..2 100644\n@@ -1 +1 @@\n-a \n+a\n \n"),
    ).toBe("diff --git a/f b/f\nindex 1..2 100644\n@@ -1 +1 @@\n-a\n+a\n\n");
    // Stable across repeated calls: composing regenerates identical bytes.
    expect(normalizePatchText(normalizePatchText(" a \nb \n"))).toBe(
      normalizePatchText(" a \nb \n"),
    );
  });
  it("keeps the combined pnpm patch equal to its per-file fragments", () => {
    expect(validatePatchBundle()).toEqual([]);
  });

  it("keeps root skills synchronized with the patched dependency", () => {
    expect(validateSkillMirror()).toEqual([]);
  });

  it("routes patched review and research skills through available SuPi tools", () => {
    const codeReview = readFileSync(join(root, "skills/engineering/code-review/SKILL.md"), "utf8");
    expect(codeReview).toContain("Use `review_run` for this workflow");
    expect(codeReview).toContain("Do not replace it with `agent_run`");
    expect(codeReview).toContain("If `review_run` is unavailable");
    expect(codeReview).toContain('mode: "change"');
    expect(codeReview).not.toContain("Spawn both sub-agents");

    const research = readFileSync(join(root, "skills/engineering/research/SKILL.md"), "utf8");
    expect(research).toContain("current foreground task");
    expect(research).toMatch(/use Context7/i);
    expect(research).toMatch(/use `web_fetch_md`/i);
    expect(research).toMatch(/use `consulting_run` only for synthesis/i);
    expect(research).not.toContain("antigravity_run");
    expect(research).not.toContain("background agent");
  });

  it("keeps generated skills compatible with Pi and repository domain paths", () => {
    const catalog = join(root, "skills");
    const files = readdirSync(catalog, { recursive: true, encoding: "utf8" }).filter((path) =>
      path.endsWith(".md"),
    );
    for (const path of files) {
      const text = readFileSync(join(catalog, path), "utf8");
      expect(text, path).not.toMatch(/\bSkill tool\b/i);
      if (!path.startsWith(join("productivity", "teach", "/"))) {
        expect(text, path).not.toMatch(/GLOSSARY(?:-MAP)?\.md/);
      }
    }
    const domain = readFileSync(join(catalog, "engineering/domain-modeling/SKILL.md"), "utf8");
    expect(domain).toContain("CONTEXT.md");
    expect(domain).toContain("CONTEXT-MAP.md");
    expect(existsSync(join(catalog, "engineering/domain-modeling/GLOSSARY-FORMAT.md"))).toBe(true);
  });

  it("matches only the teaching directory with either path format", () => {
    for (const path of [posix, win32]) {
      const prefix = path.join("productivity", "teach", "/");
      expect(path.join("productivity", "teach", "SKILL.md").startsWith(prefix)).toBe(true);
      expect(path.join("productivity", "teach-other", "SKILL.md").startsWith(prefix)).toBe(false);
      expect(path.join("engineering", "domain-modeling", "SKILL.md").startsWith(prefix)).toBe(
        false,
      );
    }
  });

  it("loads cross-group skills from their advertised locations", () => {
    for (const name of ["grill-with-docs", "wayfinder"]) {
      const text = readFileSync(join(root, ".pi/skills", name, "SKILL.md"), "utf8");
      expect(text).toContain(
        "Read the `SKILL.md` files for `grilling` and `domain-modeling` at their advertised skill locations",
      );
      expect(text).not.toContain("../../productivity/grilling/SKILL.md");
    }
  });

  it("keeps every local skill link valid", () => {
    const links = join(root, ".pi/skills");
    for (const name of readdirSync(links)) {
      expect(existsSync(join(links, name, "SKILL.md")), name).toBe(true);
    }
  });

  it("groups public catalog skills by source", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"),
    ) as {
      plugins: Array<{ name: string; skills: string[] }>;
    };

    expect(manifest.plugins.map((plugin) => plugin.name)).toEqual([
      "mattpocock-skills",
      "supi-skills",
    ]);
    expect(
      manifest.plugins.every((plugin) =>
        plugin.skills.every((path) => path.startsWith("./skills/")),
      ),
    ).toBe(true);

    const inventory = JSON.parse(
      readFileSync(join(root, "packages/supi-skill-patches/upstream.json"), "utf8"),
    ) as { includedGroups: Record<string, true>; groups: Record<string, string[]> };
    const catalogPaths = Object.keys(inventory.includedGroups).flatMap((group) =>
      (inventory.groups[group] ?? []).map((name) => `./skills/${group}/${name}`),
    );
    const groupedPaths = manifest.plugins.flatMap((plugin) => plugin.skills);

    expect(groupedPaths).toHaveLength(catalogPaths.length);
    expect(new Set(groupedPaths)).toEqual(new Set(catalogPaths));
    expect(manifest.plugins[1]?.skills).toEqual(["./skills/engineering/commit"]);
  });

  it("keeps SuPi-owned skill licenses separate from upstream licenses", () => {
    const skill = join(root, "skills/engineering/commit");

    expect(readFileSync(join(skill, "LICENSE.mrclrchtr"), "utf8")).toContain(
      "Copyright (c) 2026 Marcel Richter",
    );
    expect(existsSync(join(skill, "LICENSE.mattpocock"))).toBe(false);
  });

  it("uses Ask User for grilling rounds", () => {
    const skill = readFileSync(join(root, "skills/productivity/grilling/SKILL.md"), "utf8");

    expect(skill).toContain("Use `ask_user` for each round");
    expect(skill).toContain("- `title`:");
    expect(skill).toContain("- `questions`:");
    expect(skill).toContain("- `id`: Use the question number, such as `Q1`");
    expect(skill).toContain("- `header`: Start with the question number and add a title");
    expect(skill).toContain("- `details`:");
    expect(skill).toContain("It can also contain a sketch");
    expect(skill).toContain("- `recommendation`:");
    expect(skill).toContain("dispatch a sub-agent");
    expect(skill).not.toContain("If `ask_user` is unavailable");
    expect(skill).not.toContain("❓");
  });
});
