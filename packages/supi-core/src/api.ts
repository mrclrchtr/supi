// supi-core — shared infrastructure for SuPi extensions.
// Provides XML context tag wrapping, unified config system, context-message utilities,
// settings registry for supi-wide TUI settings, and a shared tool-spec/registration framework.
//
// Convenience barrel — re-exports all domain entry points.
// For lighter imports, use one of the domain subpaths directly
// (e.g. @mrclrchtr/supi-core/config, @mrclrchtr/supi-core/context).

// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./config.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./context.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./debug-registry.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./llm.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./path.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./project.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./session.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./settings.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./settings-ui.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./terminal.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./tool-framework.ts";
// biome-ignore lint/performance/noReExportAll: intentional convenience barrel
export * from "./types.ts";
