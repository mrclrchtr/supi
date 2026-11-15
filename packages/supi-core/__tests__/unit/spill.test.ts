import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeSpillFile } from "../../src/spill.ts";

const uid = process.getuid?.();
const posix = uid !== undefined;
let originalTmpdir: string | undefined;
let root: string;

beforeEach(() => {
  originalTmpdir = process.env.TMPDIR;
  root = mkdtempSync(join(tmpdir(), "spill-test-"));
  process.env.TMPDIR = root;
});

afterEach(() => {
  if (originalTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmpdir;
});

describe("writeSpillFile", () => {
  it("keeps every spill under one private SuPi directory and reuses identical content", () => {
    const first = writeSpillFile({ owner: "agent", name: "batch-output.md", content: "same" });
    const again = writeSpillFile({ owner: "agent", name: "batch-output.md", content: "same" });
    const other = writeSpillFile({ owner: "agent", name: "batch-output.md", content: "other" });

    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect(readFileSync(first, "utf8")).toBe("same");
    expect(readFileSync(other, "utf8")).toBe("other");
    expect(dirname(first)).toBe(join(root, posix ? `supi-${uid}` : "supi", "agent"));
    expect(first.endsWith(".md")).toBe(true);
    if (posix) {
      expect(statSync(first).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(dirname(first))).mode & 0o777).toBe(0o700);
    }
  });

  it.runIf(posix)("falls back to a fresh directory when the base is a symlink", () => {
    const elsewhere = mkdtempSync(join(root, "elsewhere-"));
    symlinkSync(elsewhere, join(root, `supi-${uid}`));

    const path = writeSpillFile({ owner: "agent", name: "batch-output.md", content: "x" });

    expect(path.startsWith(elsewhere)).toBe(false);
    expect(path.startsWith(join(root, "supi-agent-"))).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("x");
  });

  it.runIf(posix)("falls back when the base is accessible to group or others", () => {
    const base = join(root, `supi-${uid}`);
    mkdirSync(base);
    chmodSync(base, 0o777);

    const path = writeSpillFile({ owner: "agent", name: "batch-output.md", content: "x" });

    expect(path.startsWith(base)).toBe(false);
    expect(statSync(base).mode & 0o777).toBe(0o777);
  });

  it("rejects owners and names that could escape the spill directory", () => {
    expect(() => writeSpillFile({ owner: "../x", name: "a.md", content: "" })).toThrow();
    expect(() => writeSpillFile({ owner: "agent", name: "../a.md", content: "" })).toThrow();
  });
});
