import { join } from "node:path";
import { loadConfig } from "@mrclrchtr/supi-lsp/api";

/** Return entries that disable the built-in servers in an isolated test project. */
export function disabledDefaultServers(cwd: string) {
  const defaultServerNames = Object.keys(
    loadConfig(cwd, { homeDir: join(cwd, ".test-home") }).servers,
  );
  return Object.fromEntries(defaultServerNames.map((name) => [name, { enabled: false } as const]));
}
