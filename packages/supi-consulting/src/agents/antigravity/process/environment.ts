/** Environment variables that are safe and useful for a non-interactive agy process. */
export const APPROVED_ENVIRONMENT_KEYS = Object.freeze([
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_COLLATE",
  "TERM",
  "TERM_PROGRAM",
  "COLORTERM",
  "USER",
  "LOGNAME",
  "SHELL",
  "NO_COLOR",
] as const);

/** Build the restricted environment used by every Antigravity process. */
export function buildAntigravityEnvironment(
  homeDir: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of APPROVED_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  environment.HOME = homeDir;
  environment.AGY_CLI_DISABLE_AUTO_UPDATE = "true";
  return environment;
}
