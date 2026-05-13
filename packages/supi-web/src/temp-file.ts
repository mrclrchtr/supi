/**
 * Temporary file helpers for the web_fetch_md tool.
 */

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Write content to a temporary file and return the absolute path. */
export async function writeTempFile(
  content: string,
  prefix: string,
  suffix: string,
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const hash = randomBytes(4).toString("hex");
  const filePath = join(dir, `${hash}${suffix}`);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
