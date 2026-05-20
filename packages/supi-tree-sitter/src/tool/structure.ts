// Structural extraction services — re-exports from sub-modules.

export { lookupCalleesAt } from "./callees.ts";
export { extractExports } from "./exports.ts";
export { extractImports } from "./imports.ts";
export { lookupNodeAt } from "./node-at.ts";
export { collectOutline as extractOutline } from "./outline.ts";
