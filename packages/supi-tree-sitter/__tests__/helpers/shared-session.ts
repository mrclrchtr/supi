import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll } from "vitest";
import { createTreeSitterSession } from "../../src/session/session.ts";
import type { TreeSitterSession } from "../../src/types.ts";

/** One Tree-sitter session and its workspace, shared by every test in a file. */
export interface SharedTreeSitterSession {
  /** Workspace directory; emptied after each test. */
  readonly cwd: string;
  readonly session: TreeSitterSession;
}

/**
 * Share one Tree-sitter session across a test file.
 *
 * Starting a Structural Worker costs about 100 ms, while a parse on a running worker takes a few
 * milliseconds. Call this at module level. Tests that exercise worker startup, crashes, or
 * disposal must create their own session instead.
 */
export function useSharedTreeSitterSession(prefix: string): SharedTreeSitterSession {
  let cwd: string | undefined;
  let session: TreeSitterSession | undefined;

  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), prefix));
    session = createTreeSitterSession(cwd);
  });

  afterEach(() => {
    if (!cwd) return;
    rmSync(cwd, { recursive: true, force: true });
    mkdirSync(cwd);
  });

  afterAll(async () => {
    await session?.dispose();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  return {
    get cwd() {
      if (!cwd) throw new Error("The shared Tree-sitter workspace exists only while tests run");
      return cwd;
    },
    get session() {
      if (!session) throw new Error("The shared Tree-sitter session exists only while tests run");
      return session;
    },
  };
}
