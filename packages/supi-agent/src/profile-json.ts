import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Set one field in a Profile Directory's `profile.json`, creating the file when needed. */
export function updateProfileJson(
  directory: string,
  field: string,
  value: string | boolean | string[],
): void {
  const data = readProfileJson(directory);
  mkdirSync(directory, { recursive: true });
  data[field] = value;
  writeFileSync(join(directory, "profile.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Delete one field; remove the file and an emptied directory when nothing else remains. */
export function removeProfileField(directory: string, field: string): void {
  const profilePath = join(directory, "profile.json");
  if (!existsSync(profilePath)) return;
  const data = readProfileJson(directory);
  delete data[field];
  if (Object.keys(data).length === 0) {
    unlinkSync(profilePath);
    if (readdirSync(directory).length === 0) rmdirSync(directory);
    return;
  }
  writeFileSync(profilePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readProfileJson(directory: string): Record<string, unknown> {
  const path = join(directory, "profile.json");
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error("profile.json is not valid JSON.", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("profile.json must contain an object.");
  }
  return parsed as Record<string, unknown>;
}
