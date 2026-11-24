import { createHash } from "node:crypto";

/** Hex SHA-256 of UTF-8 text, as stated in Reviewer Packets. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
