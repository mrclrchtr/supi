import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakeBx {
  directory: string;
  cwd: string;
  argsFile: string;
  cleanup: () => void;
}

interface FakeBxOptions {
  wait?: boolean;
  splitUtf8?: boolean;
}

/** Create a local bx command for deterministic process tests. */
export function createFakeBx(options: FakeBxOptions = {}): FakeBx {
  const directory = mkdtempSync(join(tmpdir(), "supi-web-bx-"));
  const cwd = mkdtempSync(join(tmpdir(), "supi-web-cwd-"));
  const argsFile = join(directory, "args.txt");
  const executable = join(directory, "bx");
  const command = options.wait
    ? "exec /bin/sleep 10"
    : options.splitUtf8
      ? `printf '%s' '{"grounding":{"generic":[{"title":"'
printf '\\342\\202'
sleep 0.05
printf '\\254'
printf '%s' '","url":"https://example.test/utf8","snippets":["utf8"]}]}}'
printf '%s' "$BX_STDERR" >&2
exit "$BX_EXIT_CODE"`
      : 'printf \'%s\' "$BX_OUTPUT"\nprintf \'%s\' "$BX_STDERR" >&2\nexit "$BX_EXIT_CODE"';
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "$BX_ARGS_FILE"\n${command}\n`,
    "utf8",
  );
  chmodSync(executable, 0o755);

  return {
    directory,
    cwd,
    argsFile,
    cleanup: () => {
      rmSync(directory, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

/** Restore the default fake command after a missing-binary test. */
export function restoreFakeBx(fake: FakeBx): void {
  writeFileSync(
    join(fake.directory, "bx"),
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$BX_ARGS_FILE"\nprintf \'%s\' "$BX_OUTPUT"\nprintf \'%s\' "$BX_STDERR" >&2\nexit "$BX_EXIT_CODE"\n',
    "utf8",
  );
  chmodSync(join(fake.directory, "bx"), 0o755);
}

/** Point the current child-process environment at a fake bx command. */
export function useFakeBx(fake: FakeBx, output: string, exitCode = 0, stderr = ""): void {
  process.env.PATH = fake.directory;
  process.env.BX_ARGS_FILE = fake.argsFile;
  process.env.BX_OUTPUT = output;
  process.env.BX_STDERR = stderr;
  process.env.BX_EXIT_CODE = String(exitCode);
}

/** Read each argument captured by the fake command. */
export function readFakeBxArgs(fake: FakeBx): string[] {
  try {
    return readFileSync(fake.argsFile, "utf8").trimEnd().split("\n");
  } catch {
    return [];
  }
}

/** Write a project-scoped Web Search setting for extension tests. */
export function writeWebSearchSetting(cwd: string, enabled: boolean): void {
  const configDir = join(cwd, ".pi", "supi");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ web: { webSearchEnabled: enabled } }),
    "utf8",
  );
}
