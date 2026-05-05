import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS_DIR = join(__dirname, "../skills");
const IMPROVER_REFS = join(SKILLS_DIR, "claude-md-improver/references");
const REVISION_REFS = join(SKILLS_DIR, "claude-md-revision/references");

const REFERENCE_FILES = ["quality-criteria.md", "templates.md", "update-guidelines.md"];

describe("skill reference files sync", () => {
  for (const file of REFERENCE_FILES) {
    it(`\`${file}\` is identical in both skills`, () => {
      const improverPath = join(IMPROVER_REFS, file);
      const revisionPath = join(REVISION_REFS, file);

      const improverContent = readFileSync(improverPath, "utf-8");
      const revisionContent = readFileSync(revisionPath, "utf-8");

      expect(revisionContent).toBe(improverContent);
    });
  }
});
