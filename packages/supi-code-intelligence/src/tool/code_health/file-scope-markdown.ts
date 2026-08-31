import type { HealthDiagnosticObservation } from "../../session/health-types.ts";

/** Render the tsconfig coverage result for a single-file health request. */
export function renderFileScopeStatus(
  lines: string[],
  observation: Extract<
    HealthDiagnosticObservation,
    { kind: "completed" | "partial" | "unavailable" }
  >,
  cwd: string,
): void {
  if (observation.scope.kind !== "file" || !observation.scopeStatus) return;

  const decision = observation.scopeStatus;
  switch (decision.status) {
    case "included":
      lines.push(
        `**Tsconfig**: covered by ${formatConfigPath(decision.configPath, cwd)} — part of workspace diagnostics.`,
      );
      return;
    case "excluded":
      lines.push(
        `**Tsconfig**: NOT covered by ${formatConfigPath(decision.configPath, cwd)} — not part of workspace diagnostics.`,
      );
      return;
    case "no-config":
      lines.push("**Tsconfig**: no tsconfig.json or jsconfig.json found — nothing filtered.");
      return;
    case "out-of-tree":
      lines.push("**Tsconfig**: outside the project root — not part of workspace diagnostics.");
  }
}

/** Format a config path relative to the current workspace. */
function formatConfigPath(configPath: string | null, cwd: string): string {
  if (!configPath) return "no config";
  return `\`${makeRelative(cwd, configPath)}\``;
}

/** Format a workspace path without exposing an absolute root. */
export function makeRelative(cwd: string, file: string): string {
  return file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
}
