import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCommand } from "../commands.ts";
import { createInitialState } from "../state.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-command-test-"));
}

describe("handleCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults to status when invoked with no arguments", () => {
    const notify = vi.fn();
    const ctx = {
      cwd: tmpDir,
      ui: { notify },
    };

    handleCommand("", ctx as never, createInitialState());

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("**supi-claude-md status**"),
      "info",
    );
  });
});
