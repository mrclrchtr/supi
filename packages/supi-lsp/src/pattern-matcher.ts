import ignore from "ignore";

/** Gitignore-style glob pattern matching for path exclusion.
 *
 * Delegates to the {@link https://github.com/kaelzhang/node-ignore | ignore} package,
 * which provides battle-tested .gitignore semantics used by ESLint, Prettier, and others.
 *
 * Supports full gitignore syntax: literal names, `*` / `?` wildcards, `**` recursive globs,
 * leading `/` anchored patterns, trailing `/` directory-only patterns, and `!` negation.
 *
 * **Note:** Patterns that start with `#` are treated as comments unless escaped with `\#`.
 */

/**
 * Check whether a project-relative file path matches a gitignore-style glob pattern.
 *
 * @param filePath - Relative file path with forward slashes (e.g. `"src/__tests__/bar.test.ts"`)
 * @param pattern - Gitignore-style glob pattern (e.g. `"__tests__/"`, `"*.test.ts"`, `"/build"`)
 * @returns `true` if the file path matches the pattern
 */
export function isGlobMatch(filePath: string, pattern: string): boolean {
  if (!filePath || !pattern) return false;
  return ignore().add(pattern).ignores(filePath);
}
