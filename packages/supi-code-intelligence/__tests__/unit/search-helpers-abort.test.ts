import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { RipgrepAbortedError, runRipgrep, runRipgrepDetailed } from "../../src/search-helpers.ts";

function withTmp(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "rg-abort-"));
    writeFileSync(path.join(dir, "a.ts"), "export function foo() { return 1; }\n");
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

describe("abort-aware ripgrep", () => {
  it(
    "returns matches normally when no signal is provided (behavior identical)",
    withTmp(async (dir) => {
      const matches = await runRipgrep("foo", dir, dir);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].file).toContain("a.ts");
    }),
  );

  it(
    "treats exit code 1 (no matches) as an empty result, not an error",
    withTmp(async (dir) => {
      const result = await runRipgrepDetailed("zzzNoSuchPattern_xyz", dir, dir);
      expect(result.matches).toEqual([]);
      expect(result.error).toBeUndefined();
    }),
  );

  it(
    "rejects with RipgrepAbortedError when the signal is already aborted (runRipgrepDetailed)",
    withTmp(async (dir) => {
      const ac = new AbortController();
      ac.abort();
      await expect(
        runRipgrepDetailed("foo", dir, dir, { signal: ac.signal }),
      ).rejects.toBeInstanceOf(RipgrepAbortedError);
    }),
  );

  it(
    "rejects with RipgrepAbortedError through the runRipgrep wrapper too",
    withTmp(async (dir) => {
      const ac = new AbortController();
      ac.abort();
      await expect(runRipgrep("foo", dir, dir, { signal: ac.signal })).rejects.toBeInstanceOf(
        RipgrepAbortedError,
      );
    }),
  );

  it(
    "rejects when the signal aborts mid-search",
    withTmp(async (dir) => {
      // Many files so the search has work to interrupt. Generate 400 files.
      for (let i = 0; i < 400; i++) {
        writeFileSync(path.join(dir, `f${i}.ts`), `export function foo${i}() { return ${i}; }\n`);
      }
      const ac = new AbortController();
      const p = runRipgrepDetailed("foo", dir, dir, { maxMatches: 1000, signal: ac.signal });
      ac.abort();
      await expect(p).rejects.toBeInstanceOf(RipgrepAbortedError);
    }),
  );
});
