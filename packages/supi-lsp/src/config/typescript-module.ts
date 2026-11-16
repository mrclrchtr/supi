import { createRequire } from "node:module";
import type ts from "typescript";

const require = createRequire(import.meta.url);
let cached: typeof ts | undefined;

/**
 * Load the bundled TypeScript compiler API on first use.
 *
 * Evaluating `typescript` costs roughly 100 ms, and most sessions and tests that import this
 * package never ask a tsconfig question. Callers stay synchronous, so this uses `require`
 * rather than a dynamic `import()`.
 */
export function getTypeScript(): typeof ts {
  cached ??= require("typescript") as typeof ts;
  return cached;
}
