import { statSync } from "node:fs";

/**
 * File metadata that identifies one observed on-disk state of a document.
 *
 * A stamp can only withdraw diagnostic confirmation: a different stamp means
 * the file may have changed since its content was last read. Only a content
 * read restores confirmation. `ctimeNs` catches tools that restore mtime
 * (`cp -p`, `rsync -t`, `touch -r`, tar); `ino` catches atomic replace.
 * A same-size rewrite within one timestamp tick is not detected.
 */
export interface DiskStamp {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface BigIntStatLike {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

/** Convert a bigint stat result into a stamp. */
export function toDiskStamp(stats: BigIntStatLike): DiskStamp {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  };
}

/**
 * Stat one file before its content is read. Returns undefined on any failure;
 * the following read decides whether the file is missing or unreadable.
 */
export function statDiskStampSync(filePath: string): DiskStamp | undefined {
  try {
    return toDiskStamp(statSync(filePath, { bigint: true }));
  } catch {
    return undefined;
  }
}

/** Compare two stamps field by field. */
export function sameDiskStamp(a: DiskStamp, b: DiskStamp): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
