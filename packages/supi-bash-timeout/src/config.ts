import { loadSupiConfig } from "@mrclrchtr/supi-core";

export interface BashTimeoutConfig {
  defaultTimeout: number;
}

export const BASH_TIMEOUT_DEFAULTS: BashTimeoutConfig = {
  defaultTimeout: 120,
};

function isValidTimeout(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function loadBashTimeoutConfig(cwd: string, homeDir?: string): BashTimeoutConfig {
  const raw = loadSupiConfig("bash-timeout", cwd, BASH_TIMEOUT_DEFAULTS, { homeDir });
  return {
    defaultTimeout: isValidTimeout(raw.defaultTimeout)
      ? raw.defaultTimeout
      : BASH_TIMEOUT_DEFAULTS.defaultTimeout,
  };
}
