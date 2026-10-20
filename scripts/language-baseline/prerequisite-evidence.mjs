import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Check the exact executable bytes, including builds that omit a commit in --version. */
export function requireBinaryDigest(command, expected, label) {
  const actual = createHash("sha256").update(readFileSync(command)).digest("hex");
  if (!/^[a-f0-9]{64}$/u.test(expected ?? "") || actual !== expected) {
    throw new Error(`${label} executable does not match its pinned SHA-256 digest: ${actual}.`);
  }
}

/** Match Java's runtime build syntax without dropping the pinned build number. */
export function javaRuntimeBuildMarker(version) {
  return `(build ${version.replace(/(?:\.0)+(?=\+)/u, "")})`;
}
