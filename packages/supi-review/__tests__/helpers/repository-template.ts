import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/**
 * Build a fixture repository once per test file and copy it for each test.
 *
 * Building a repository takes about ten Git processes; copying one takes a few milliseconds. Every
 * copy has the same commit hashes. Call this at module level. `build` returns facts about the
 * repository, such as commit hashes, that the returned function hands back with each copy.
 *
 * @returns A function that copies the template into an existing empty directory.
 */
export function useRepositoryTemplate<T>(build: (cwd: string) => T): (cwd: string) => T {
  let template: { readonly cwd: string; readonly facts: T } | undefined;

  afterAll(() => {
    if (template) rmSync(template.cwd, { recursive: true, force: true });
    template = undefined;
  });

  return (cwd) => {
    if (!template) {
      const templateCwd = mkdtempSync(join(tmpdir(), "supi-review-template-"));
      template = { cwd: templateCwd, facts: build(templateCwd) };
    }
    cpSync(template.cwd, cwd, { recursive: true });
    return template.facts;
  };
}
