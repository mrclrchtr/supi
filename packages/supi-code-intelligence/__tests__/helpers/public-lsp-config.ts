import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "@mrclrchtr/supi-lsp/api";

interface FixtureServerOptions {
  readonly args: readonly string[];
  readonly fileTypes: readonly string[];
}

/** Write one fixture route and disable every built-in route in an isolated project. */
export function writeIsolatedFixtureConfig(cwd: string, options: FixtureServerOptions): void {
  // Use the public defaults loader with an empty home so user config cannot add live routes.
  const defaultServerNames = Object.keys(
    loadConfig(cwd, { homeDir: join(cwd, ".test-home") }).servers,
  );
  const disabledServers = Object.fromEntries(
    defaultServerNames.map((name) => [name, { enabled: false }]),
  );

  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      lsp: {
        servers: {
          fixture: {
            command: process.execPath,
            args: options.args,
            fileTypes: options.fileTypes,
            rootMarkers: ["project.marker"],
          },
          ...disabledServers,
        },
      },
    }),
  );
}
