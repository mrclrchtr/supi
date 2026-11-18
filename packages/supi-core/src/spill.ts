// supi-core spill domain — create-only temp files for full tool output (#597).
//
// SuPi never deletes spill files. Instead, it writes few of them: one private base directory per
// user, content-addressed names, and reuse for identical content. The OS temp purge owns their
// lifetime, so paths returned to the model stay readable for the session.

import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

/** Input for {@link writeSpillFile}. */
export interface SpillFileOptions {
  /** Producer id used as sub-directory, e.g. `"agent"`. Lowercase letters, digits, and dashes. */
  owner: string;
  /** Descriptive file name, e.g. `"snapshot.md"`. The content hash is inserted before the extension. */
  name: string;
  /** Full content to persist: text (written as UTF-8) or raw bytes. */
  content: string | Uint8Array;
}

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Persist full output that did not fit inline and return its absolute path.
 *
 * Layout: `$TMPDIR/supi-<uid>/<owner>/<stem>-<sha256 prefix><ext>`. Identical content maps to the
 * same file, which is reused. Both directories must be real directories owned by the current
 * user without group/other access; otherwise the file falls back to a fresh `mkdtemp`
 * directory, as before. Files are created with mode `0600` and published atomically by rename.
 */
export function writeSpillFile({ owner, name, content }: SpillFileOptions): string {
  if (!SEGMENT.test(owner)) throw new Error(`Invalid spill owner: ${owner}`);
  if (!FILE_NAME.test(name)) throw new Error(`Invalid spill file name: ${name}`);
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 32);
  const fileName = `${stem}-${hash}${extension}`;

  const directory = privateSpillDirectory(owner);
  if (!directory) {
    const fallback = join(mkdtempSync(join(tmpdir(), `supi-${owner}-`)), fileName);
    writeFileSync(fallback, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return fallback;
  }

  const target = join(directory, fileName);
  if (isRegularFile(target)) return target;
  const staging = join(directory, `.${fileName}.${process.pid}.${randomBytes(4).toString("hex")}`);
  writeFileSync(staging, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  // Atomic publish; a concurrent writer of the same hash replaces it with identical bytes.
  renameSync(staging, target);
  return target;
}

/** Return the validated private spill directory for `owner`, or undefined when it is unsafe. */
function privateSpillDirectory(owner: string): string | undefined {
  const uid = process.getuid?.();
  const base = join(tmpdir(), uid === undefined ? "supi" : `supi-${uid}`);
  if (!ensurePrivateDirectory(base, uid)) return undefined;
  const directory = join(base, owner);
  return ensurePrivateDirectory(directory, uid) ? directory : undefined;
}

/**
 * Create `path` with mode `0700` if missing, then accept it only when it is a real directory
 * (not a symlink) owned by `uid` with no group/other permissions. Never modifies or removes an
 * existing entry. Ownership and mode checks are skipped where POSIX ids are unavailable.
 */
function ensurePrivateDirectory(path: string, uid: number | undefined): boolean {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") return false;
  }
  try {
    const stats = lstatSync(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    if (uid === undefined) return true;
    return stats.uid === uid && (stats.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}
