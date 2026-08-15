import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "./file-walk.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchRoot = join(packageRoot, "patches", "mattpocock-skills");
const filesRoot = join(patchRoot, "files");
const combinedPath = join(patchRoot, "combined.patch");

/** Strip trailing whitespace from every patch line, matching the repo's whitespace hook. */
export function normalizePatchText(text: string): string {
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return `${lines.map((line) => line.replace(/[ \t]+$/u, "")).join("\n")}\n`;
}

/** Compose the deterministic pnpm patch from its per-file fragments. */
export function composePatch(): string {
  const files = existsSync(filesRoot)
    ? walkFiles(filesRoot).filter((path) => path.endsWith(".patch"))
    : [];
  // Normalize each fragment so the combined patch is canonical: the repo's
  // whitespace hook strips trailing whitespace at commit time, and the lockfile
  // records a hash of the checked-in patch. A non-canonical fragment would
  // otherwise flip that hash on every edit.
  return files.map((path) => normalizePatchText(readFileSync(path, "utf8"))).join("");
}

/** Write the combined patch consumed by pnpm, or remove it when no fragments exist. */
export function writeCombinedPatch(): void {
  const patch = composePatch();
  if (patch.length === 0) {
    rmSync(combinedPath, { force: true });
    return;
  }
  writeFileSync(combinedPath, patch);
}

function fragmentPath(chunk: string): string {
  const match = /^diff --git a\/(\S+) b\/(\S+)$/m.exec(chunk);
  if (!match || match[1] !== match[2]) {
    throw new Error("Each patch fragment must change exactly one existing file");
  }
  const sourcePath = match[2];
  if (sourcePath.split("/").includes("..")) throw new Error(`Unsafe patch path: ${sourcePath}`);
  return join(filesRoot, `${sourcePath}.patch`);
}

/** Split the current pnpm patch into one fragment for each changed upstream file. */
export function splitCombinedPatch(): void {
  const combined = normalizePatchText(readFileSync(combinedPath, "utf8"));
  const starts = Array.from(combined.matchAll(/^diff --git /gm), (match) => match.index);
  if (starts.length === 0 || starts[0] !== 0) throw new Error("Combined patch has no file diffs");
  const entries = starts.map((start, index) => {
    const chunk = combined.slice(start, starts[index + 1] ?? combined.length);
    return { chunk, path: fragmentPath(chunk) };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new Error("Combined patch contains duplicate file diffs");
  }

  rmSync(filesRoot, { recursive: true, force: true });
  for (const entry of entries) {
    mkdirSync(dirname(entry.path), { recursive: true });
    writeFileSync(entry.path, entry.chunk);
  }
}

/** Return errors when the checked-in pnpm patch differs from its fragments. */
export function validatePatchBundle(): string[] {
  const errors: string[] = [];
  const fragmentFiles = existsSync(filesRoot)
    ? walkFiles(filesRoot).filter((path) => path.endsWith(".patch"))
    : [];
  for (const path of fragmentFiles) {
    if (normalizePatchText(readFileSync(path, "utf8")) === readFileSync(path, "utf8")) {
      continue;
    }
    errors.push(
      `Patch fragment has trailing whitespace: ${relative(packageRoot, path).split(sep).join("/")} — run pnpm skills:patches:compose after editing fragments.`,
    );
  }
  const expected = composePatch();
  if (!existsSync(combinedPath)) {
    return expected.length === 0
      ? errors
      : [...errors, `Missing ${relative(packageRoot, combinedPath).split(sep).join("/")}`];
  }
  const actual = readFileSync(combinedPath, "utf8");
  if (normalizePatchText(actual) !== actual) {
    errors.push(`Combined patch has trailing whitespace — run pnpm skills:patches:compose.`);
  }
  if (actual !== expected && expected.length > 0) {
    errors.push(
      `Patch fragments do not match ${relative(packageRoot, combinedPath).split(sep).join("/")}`,
    );
  }
  return errors;
}
