/**
 * Temporary file helpers for the web tools.
 */

import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

/** Write content to a unique temporary file and return the absolute path. */
export async function writeTempFile(
  content: string,
  prefix: string,
  suffix: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const hash = randomBytes(4).toString("hex");
  const filePath = join(dir, `${hash}${suffix}`);
  await withFileMutationQueue(filePath, () => writeFile(filePath, content, "utf8"));
  return filePath;
}
