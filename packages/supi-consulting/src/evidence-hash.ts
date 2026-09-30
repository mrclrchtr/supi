import { createHash } from "node:crypto";

/** Hash evidence references before they cross the private agent adapter boundary. */
export function hashEvidence(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
