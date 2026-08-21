// Debug domain entry for `@mrclrchtr/supi-core/debug`.
//
// Kept separate from debug-registry.ts so debug-timing.ts can import the
// registry without creating an import cycle through the barrel re-export.

// biome-ignore lint/performance/noReExportAll: preserve the stable debug domain entry point
export * from "./debug-registry.ts";
// biome-ignore lint/performance/noReExportAll: preserve the stable debug domain entry point
export * from "./debug-timing.ts";
