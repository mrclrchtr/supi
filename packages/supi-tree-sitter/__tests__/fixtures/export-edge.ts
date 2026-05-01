export function* gen() {}
export default function* defaultGen() {}
export abstract class AbstractBase {}
export declare function declared(): void;
export namespace Tools {}
// biome-ignore lint/performance/noReExportAll: fixture exercises namespace re-export extraction.
export * as mod from "./mod.ts";
