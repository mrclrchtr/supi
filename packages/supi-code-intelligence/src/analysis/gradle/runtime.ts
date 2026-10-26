import { constants, promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertUnlinkedPath } from "../workspace/safe-path.ts";
import type { GradleRuntime } from "./types.ts";

/** A missing/incompatible prerequisite is evidence, not an empty Gradle build. */
export class GradlePrerequisiteError extends Error {
  constructor(
    readonly status: "unavailable" | "unsupported",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Require a settings file at exactly this root; never search ancestors or follow links. */
export async function hasGradleSettings(root: string): Promise<boolean> {
  for (const name of ["settings.gradle", "settings.gradle.kts"]) {
    try {
      await assertUnlinkedPath(root, name, true);
      if ((await fs.lstat(path.join(root, name))).isFile()) return true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return false;
}

/** Select the wrapper distribution first, or a real PATH installation, without executing scripts. */
export async function selectGradleRuntime(
  root: string,
  searchPath = process.env.PATH ?? "",
): Promise<GradleRuntime> {
  return (await wrapperRuntime(root)) ?? pathRuntime(searchPath);
}

async function wrapperRuntime(root: string): Promise<GradleRuntime | undefined> {
  const relative = "gradle/wrapper/gradle-wrapper.properties";
  const properties = path.join(root, relative);
  try {
    await assertUnlinkedPath(root, relative, true);
    const info = await fs.lstat(properties);
    if (!info.isFile() || info.size > 1_048_576)
      throw new GradlePrerequisiteError(
        "unavailable",
        "Wrapper properties must be a regular file no larger than 1 MiB.",
      );
    const values = parseProperties(await fs.readFile(properties, "latin1"));
    const distribution = values.get("distributionUrl");
    if (!distribution)
      throw new GradlePrerequisiteError(
        "unavailable",
        "Wrapper properties have no distributionUrl; no PATH substitution was attempted.",
      );
    let url: URL;
    try {
      url = new URL(distribution, pathToFileURL(properties));
    } catch (error) {
      // biome-ignore lint/style/useErrorCause: This typed error accepts ErrorOptions as its third argument.
      throw new GradlePrerequisiteError("unavailable", "Wrapper distributionUrl is unresolvable.", {
        cause: error,
      });
    }
    if (!["https:", "http:", "file:"].includes(url.protocol))
      throw new GradlePrerequisiteError(
        "unavailable",
        "Wrapper distribution protocol is unsupported.",
      );
    const version = decodeURIComponent(url.pathname).match(
      /(?:^|\/)gradle-(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?)-(?:bin|all)\.zip$/,
    )?.[1];
    if (!version)
      throw new GradlePrerequisiteError(
        "unavailable",
        "Wrapper distribution version cannot be established from its URL; no fallback was used.",
      );
    requireGradle9(version);
    if (url.protocol === "file:") await fs.access(fileURLToPath(url));
    return { kind: "distribution", value: url.href, source: properties, version };
  } catch (error) {
    if (!isMissing(error)) throw error;
    // A missing archive is not the same as missing wrapper properties.
    if (await fs.lstat(properties).catch(() => null))
      // biome-ignore lint/style/useErrorCause: This typed error accepts ErrorOptions as its third argument.
      throw new GradlePrerequisiteError(
        "unavailable",
        "Wrapper distribution archive is missing; no fallback was used.",
        { cause: error },
      );
    return undefined;
  }
}

async function pathRuntime(searchPath: string): Promise<GradleRuntime> {
  const executable = await findExecutable("gradle", searchPath);
  if (!executable)
    throw new GradlePrerequisiteError(
      "unavailable",
      "No wrapper properties or Gradle installation on PATH.",
    );
  const real = await fs.realpath(executable);
  const home = path.dirname(path.dirname(real));
  if (path.basename(path.dirname(real)) !== "bin")
    throw new GradlePrerequisiteError(
      "unavailable",
      `PATH Gradle is not a resolvable installation: ${executable}. Put the selected installation's bin directory on PATH; shims are not executed.`,
    );
  const libs = await fs.readdir(path.join(home, "lib")).catch(() => []);
  const versions = libs.flatMap((name) => name.match(/^gradle-launcher-(.+)\.jar$/)?.[1] ?? []);
  if (versions.length !== 1)
    throw new GradlePrerequisiteError(
      "unavailable",
      `PATH Gradle installation cannot be resolved: ${executable}. Version-manager shims are not executed.`,
    );
  requireGradle9(versions[0]);
  return { kind: "installation", value: home, source: executable, version: versions[0] };
}

/** Resolve only existing executable files, preserving PATH precedence. */
export async function findExecutable(
  name: string,
  searchPath = process.env.PATH ?? "",
): Promise<string | undefined> {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, process.platform === "win32" ? `${name}.exe` : name);
    try {
      await fs.access(candidate, constants.X_OK);
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      /* Try the next PATH entry. */
    }
  }
  return undefined;
}

/** Only Gradle 9 is supported, including when an explicit wrapper names another major. */
export function requireGradle9(version: string): void {
  if (!/^9\./.test(version))
    throw new GradlePrerequisiteError(
      "unsupported",
      `Gradle ${version} is unsupported; only Gradle 9 is supported. No fallback was used.`,
    );
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Java properties escapes and continuations, not a Groovy/Kotlin settings interpreter. */
function parseProperties(text: string): Map<string, string> {
  const values = new Map<string, string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const decode = (value: string) =>
    value.replace(
      /\\u([0-9a-fA-F]{4})|\\(.)/g,
      (_match, hex: string | undefined, escaped: string) =>
        hex
          ? String.fromCharCode(Number.parseInt(hex, 16))
          : ({ t: "\t", r: "\r", n: "\n", f: "\f" }[escaped] ?? escaped),
    );
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimStart();
    if (/^[#!]/.test(line)) continue;
    while ((line.match(/\\+$/)?.[0].length ?? 0) % 2 === 1 && i + 1 < lines.length)
      line = line.slice(0, -1) + lines[++i].trimStart();
    const match = line.match(/^((?:\\.|[^\s:=\\])+)(?:\s*[:=]\s*|\s+)?(.*)$/);
    if (match) values.set(decode(match[1]), decode(match[2]));
  }
  return values;
}
