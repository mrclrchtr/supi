// Shared test utilities for supi-code-intelligence tests.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDir {
  tmpDir: string;
  cleanup: () => void;
  writeFile: (file: string, content: string) => void;
  writeJson: (file: string, data: unknown) => void;
}

/**
 * Create a temporary directory for test fixtures.
 * Callers should invoke `cleanup()` in `afterEach` to remove the directory.
 *
 * @example
 *   const t = createTempDir("my-test-");
 *   afterEach(() => t.cleanup());
 *   t.writeJson("package.json", { name: "test" });
 */
export function createTempDir(prefix = "code-intel-"): TempDir {
  const tmpDir = mkdtempSync(join(tmpdir(), prefix));

  return {
    tmpDir,
    cleanup: () => {
      rmSync(tmpDir, { recursive: true, force: true });
    },
    writeFile: (file: string, content: string) => {
      const fullPath = join(tmpDir, file);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    },
    writeJson: (file: string, data: unknown) => {
      writeFileSync(join(tmpDir, file), JSON.stringify(data, null, 2));
    },
  };
}
