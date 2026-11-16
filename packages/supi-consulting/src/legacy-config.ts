import { homedir } from "node:os";
import { getSupiConfigPath, loadSupiConfigSectionForScope } from "@mrclrchtr/supi-core/config";
import { CONSULTING_CONFIG_SECTION, CONSULTING_DEFAULTS } from "./config.ts";

/** The configuration section used by the retired `supi-antigravity` package. */
export const LEGACY_ANTIGRAVITY_CONFIG_SECTION = "antigravity";

type Scope = "global" | "project";

/** One scope that still contains the ignored legacy section. */
export interface LegacyAntigravityFinding {
  scope: Scope;
  path: string;
  /** The ignored legacy value, when it is a boolean. */
  agentToolEnabled?: boolean;
}

/** The effective `consulting.agentToolEnabled` value and where it comes from. */
export interface EffectiveAgentToolSetting {
  value: boolean;
  source: "default" | Scope;
}

/** Inputs for one legacy configuration check. */
export interface LegacyAntigravityCheckOptions {
  cwd: string;
  homeDir?: string;
  projectTrusted: boolean;
}

/**
 * Build the migration warning for an ignored `antigravity` section, or return undefined.
 *
 * Detection is read-only and never affects the effective configuration. Project files are
 * inspected even when the project is untrusted, so an old project-level disable is not lost
 * silently; the warning then explains that project settings do not apply.
 */
export function checkLegacyAntigravityConfig(
  options: LegacyAntigravityCheckOptions,
): string | undefined {
  const findings = detectLegacyAntigravityConfig(options);
  if (findings.length === 0) return undefined;
  return formatLegacyAntigravityWarning(
    findings,
    resolveEffectiveAgentToolSetting(options),
    options.projectTrusted,
    options.homeDir ?? homedir(),
  );
}

/** Find global and project config files that still contain the legacy section. */
export function detectLegacyAntigravityConfig(
  options: Pick<LegacyAntigravityCheckOptions, "cwd" | "homeDir">,
): LegacyAntigravityFinding[] {
  const findings: LegacyAntigravityFinding[] = [];
  for (const scope of ["global", "project"] as const) {
    const section = readSection(LEGACY_ANTIGRAVITY_CONFIG_SECTION, scope, options);
    if (!section) continue;
    const value = section.agentToolEnabled;
    findings.push({
      scope,
      path: getSupiConfigPath(scope, options.cwd, { homeDir: options.homeDir }),
      ...(typeof value === "boolean" ? { agentToolEnabled: value } : {}),
    });
  }
  return findings;
}

/** Resolve `consulting.agentToolEnabled` with the same precedence as `loadConsultingConfig`. */
export function resolveEffectiveAgentToolSetting(
  options: LegacyAntigravityCheckOptions,
): EffectiveAgentToolSetting {
  const scopes: Scope[] = options.projectTrusted ? ["project", "global"] : ["global"];
  for (const scope of scopes) {
    const value = readSection(CONSULTING_CONFIG_SECTION, scope, options)?.agentToolEnabled;
    if (typeof value === "boolean") return { value, source: scope };
  }
  return { value: CONSULTING_DEFAULTS.agentToolEnabled, source: "default" };
}

/** Format one bounded, actionable warning that names both keys and the effective setting. */
export function formatLegacyAntigravityWarning(
  findings: readonly LegacyAntigravityFinding[],
  effective: EffectiveAgentToolSetting,
  projectTrusted: boolean,
  homeDir: string,
): string {
  const locations = findings
    .map((finding) => {
      const value =
        finding.agentToolEnabled === undefined
          ? ""
          : `, agentToolEnabled: ${finding.agentToolEnabled}`;
      return `${finding.scope} ${shortenPath(finding.path, homeDir)}${value}`;
    })
    .join("; ");
  const source =
    effective.source === "default" ? "default" : `${effective.source} consulting.agentToolEnabled`;
  const state = effective.value ? "enabled" : "disabled";
  // The retired loader merged global then project without a trust gate.
  const legacyValue = [...findings]
    .reverse()
    .find((finding) => finding.agentToolEnabled !== undefined)?.agentToolEnabled;
  const conflicts = legacyValue !== undefined && legacyValue !== effective.value;
  const lines = [
    `Consulting ignores the legacy "antigravity" configuration section (${locations}).`,
    `Only consulting.agentToolEnabled applies: it is ${effective.value} (${source}), so consulting_run is ${state}.`,
  ];
  if (!projectTrusted && findings.some((finding) => finding.scope === "project")) {
    lines.push(
      "The project is not trusted in Pi, so project settings in either section do not apply.",
    );
  }
  lines.push(
    conflicts
      ? `To keep the old behavior, set consulting.agentToolEnabled to ${!effective.value}. Then remove the "antigravity" section and reload Pi.`
      : `Remove the "antigravity" section and reload Pi; no setting change is needed.`,
  );
  return lines.join(" ");
}

function readSection(
  section: string,
  scope: Scope,
  options: Pick<LegacyAntigravityCheckOptions, "cwd" | "homeDir">,
): Record<string, unknown> | null {
  return loadSupiConfigSectionForScope(section, options.cwd, { scope, homeDir: options.homeDir });
}

function shortenPath(path: string, homeDir: string): string {
  return homeDir && path.startsWith(`${homeDir}/`) ? `~${path.slice(homeDir.length)}` : path;
}
