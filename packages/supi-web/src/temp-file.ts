/**
 * Temporary file helpers for the web tools.
 */

import { writeSpillFile } from "@mrclrchtr/supi-core/spill";

/**
 * Persist content as a SuPi spill file and return the absolute path.
 * Identical content reuses one file; SuPi never deletes it (#597).
 */
export async function writeTempFile(
  content: string,
  prefix: string,
  suffix: string,
): Promise<string> {
  return writeSpillFile({ owner: "web", name: `${prefix}${suffix}`, content });
}

/** Persist image bytes as a SuPi spill file and return the absolute path. */
export function writeImageFile(content: Uint8Array, prefix: string, suffix: string): string {
  return writeSpillFile({ owner: "web", name: `${prefix}${suffix}`, content });
}
