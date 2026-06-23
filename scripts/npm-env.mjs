const UNSUPPORTED_NPM_ENV_KEYS = [
  "npm_config_manage_package_manager_versions",
  "NPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS",
];

/**
 * pnpm exec injects an npm-only env config key that npm 11 warns about.
 * Strip it before running npm so pack/publish output stays clean.
 */
export function sanitizeNpmEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of UNSUPPORTED_NPM_ENV_KEYS) {
    delete env[key];
  }
  return env;
}
