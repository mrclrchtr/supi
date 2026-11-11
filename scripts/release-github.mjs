import { execFileSync } from "node:child_process";

/** Call GitHub through gh; only an explicit 404 may be treated as an absent resource. */
export function github(path, { method = "GET", body, allowMissing = false } = {}) {
  const args = ["api", path, "--method", method];
  if (body !== undefined) args.push("--input", "-");
  try {
    const output = execFileSync("gh", args, {
      input: body === undefined ? undefined : JSON.stringify(body),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim() ? JSON.parse(output) : null;
  } catch (error) {
    if (allowMissing && /\(HTTP 404\)/.test(error.stderr ?? "")) return null;
    throw error;
  }
}
