import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { major, prerelease, valid } from "semver";
import type { ServerConfig, TypeScriptSelection } from "./server-config.ts";

interface CompilerPackage {
  directory: string;
  name?: string;
  version?: string;
  bin?: unknown;
}

/** Launch options and truthful compiler facts for one root; never cached across starts. */
export interface TypeScriptLaunch {
  /** Native packages use their declared Node launcher, without a PATH dependency. */
  command?: string;
  args?: string[];
  initializationOptions: unknown;
  typescript?: TypeScriptSelection;
}

/** Retain already-known selection facts when validating launch files fails. */
class TypeScriptLaunchError extends Error {
  readonly typescript: TypeScriptSelection | undefined;
  constructor(message: string, options: ErrorOptions & { typescript?: TypeScriptSelection }) {
    super(message, options);
    this.typescript = options.typescript;
  }
}

/** True for an installed package name/alias, never a path, URL, or package subpath. */
export function isTypeScriptPackageName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:@[a-z0-9._-]+\/)?[a-z0-9_][a-z0-9._-]*$/i.test(value) &&
    ![".", ".."].includes(value)
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Resolve fresh package files using Node's root-relative node_modules search paths.
 * Probing the package directory (rather than require.resolve's cached realpath) both
 * detects broken selections and observes package-manager symlink changes on retry.
 * Package exports need not expose package.json; no compiler code is executed.
 */
function findPackage(name: string, from: string): CompilerPackage | undefined {
  const require = createRequire(path.join(from, "__supi_lsp_resolve__.cjs"));
  for (const base of require.resolve.paths(name) ?? []) {
    const directory = path.join(base, name);
    try {
      fs.lstatSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    return readCompilerPackage(fs.realpathSync(directory));
  }
  return undefined;
}

function readCompilerPackage(directory: string): CompilerPackage {
  const manifest = record(
    JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")),
  );
  if (
    !manifest ||
    (manifest.name !== undefined && typeof manifest.name !== "string") ||
    (manifest.version !== undefined &&
      (typeof manifest.version !== "string" || !valid(manifest.version)))
  ) {
    throw new Error(`Invalid package manifest at ${directory}`);
  }
  return {
    directory,
    name: typeof manifest.name === "string" ? manifest.name : undefined,
    version: typeof manifest.version === "string" ? manifest.version : undefined,
    bin: manifest.bin,
  };
}

/** Apply the bounded TypeScript compiler policy without changing the settings snapshot.
 * Programmatic configurations without loader provenance remain manual. Explicit
 * launch fields bypass all package probing; a selector may not coexist with them.
 */
export function resolveTypeScriptLaunch(
  name: string,
  config: ServerConfig,
  root: string,
): TypeScriptLaunch {
  const unchanged = { initializationOptions: config.initializationOptions };
  if (name !== "typescript") return unchanged;
  if (isManualTypeScriptLaunch(config, root)) return unchanged;
  const selector = config.typescriptPackage;
  let selected = selector ?? "typescript";
  try {
    if (!isTypeScriptPackageName(selected))
      throw new Error("Expected an installed package name or alias, not a filesystem path.");
    const probe = (installedName: string) => {
      selected = installedName; // Retain the failing candidate's identity for the error.
      return findPackage(installedName, root);
    };
    const selection =
      selector === undefined ? selectAutomaticCompiler(probe) : { selected, pkg: probe(selected) };
    const { pkg } = selection;
    selected = selection.selected;
    if (!pkg) {
      if (selector !== undefined) throw new Error("Selected package is not installed.");
      return unchanged; // Preserve TLS's legacy lookup when neither candidate exists.
    }
    return compilerLaunch(config.initializationOptions, pkg, selected);
  } catch (error) {
    throw new TypeScriptLaunchError(
      `TypeScript launch at ${root}, package "${selected}": ${error instanceof Error ? error.message : String(error)} Repair/install the selected TypeScript package, or use explicit launch configuration; then refresh health. Reload after changing launch settings.`,
      {
        cause: error,
        typescript: error instanceof TypeScriptLaunchError ? error.typescript : undefined,
      },
    );
  }
}

/** Short-circuit on native metadata; validate only the winner's launch files later. */
function selectAutomaticCompiler(probe: (name: string) => CompilerPackage | undefined): {
  selected: string;
  pkg?: CompilerPackage;
} {
  const canonical = probe("typescript");
  if (canonical && compilerBackend(canonical) === "native")
    return { selected: "typescript", pkg: canonical };
  const native = probe("@typescript/native");
  if (native) {
    if (compilerBackend(native) !== "native")
      throw new Error("@typescript/native must alias the stable native typescript package.");
    return { selected: "@typescript/native", pkg: native };
  }
  if (canonical) return { selected: "typescript", pkg: canonical };
  return { selected: "@typescript/typescript6", pkg: probe("@typescript/typescript6") };
}

/** Determine launch authority and reject conflicting selectors without probing installations. */
export function isManualTypeScriptLaunch(config: ServerConfig, root: string): boolean {
  const fields = config.typescriptExplicitFields ?? { command: "programmatic configuration" };
  const tsserver = record(record(config.initializationOptions)?.tsserver);
  const conflicts = [
    ...(fields.command ? [`command (${fields.command})`] : []),
    ...(fields.args ? [`args (${fields.args})`] : []),
    ...(tsserver && Object.hasOwn(tsserver, "path")
      ? [
          `initializationOptions.tsserver.path (${fields.tsserverPath ?? "programmatic configuration"})`,
        ]
      : []),
  ];
  if (config.typescriptPackage !== undefined && conflicts.length) {
    throw new Error(
      `TypeScript launch at ${root}: typescriptPackage "${config.typescriptPackage}" (${fields.typescriptPackage ?? "programmatic configuration"}) conflicts with ${conflicts.join(", ")}. Remove the selector or the explicit launch fields and reload.`,
    );
  }
  return conflicts.length > 0;
}

/** Classify consulted metadata before considering a lower-priority candidate. */
function compilerBackend(pkg: CompilerPackage): "native" | "tsserver" {
  if (pkg.name === "@typescript/typescript6" && !pkg.version) return "tsserver";
  if (pkg.name === "typescript" && !pkg.version)
    throw new Error(
      `Selected implementation at ${pkg.directory} has no compiler version in package.json.`,
    );
  const version = pkg.version && !prerelease(pkg.version) ? major(pkg.version) : undefined;
  if (pkg.name === "@typescript/typescript6" && version === 6) return "tsserver";
  if (pkg.name === "typescript" && version !== undefined && version <= 7)
    return version === 7 ? "native" : "tsserver";
  throw new Error(
    `Unsupported automatic TypeScript backend ${pkg.name ?? "(unknown identity)"} ${pkg.version ?? "(unknown version)"}. Select an installed stable TS7 or legacy TypeScript package with typescriptPackage, or configure command/args manually.`,
  );
}

function compilerLaunch(
  initializationOptions: unknown,
  selectedPackage: CompilerPackage,
  selected: string,
): TypeScriptLaunch {
  let pkg = selectedPackage;
  const backend = compilerBackend(pkg);
  if (backend === "native") return nativeLaunch(initializationOptions, pkg, selected);
  const wrapper = pkg.name === "@typescript/typescript6" ? pkg : undefined;
  if (wrapper) {
    const underlying = findPackage("@typescript/old", wrapper.directory);
    if (!underlying)
      throw new Error(`Wrapper at ${wrapper.directory} has no @typescript/old dependency.`);
    pkg = underlying;
  }
  // TLS ignores an explicit path without implementation version metadata and
  // tries other installations. Fail here rather than report a compiler it won't use.
  if (!pkg.version)
    throw new Error(
      `Selected implementation at ${pkg.directory} has no compiler version in package.json; TLS would ignore this selection.`,
    );
  if (compilerBackend(pkg) !== "tsserver" || pkg.name !== "typescript")
    throw new Error(`Wrapper implementation at ${pkg.directory} must be legacy TypeScript.`);
  const serverPath = path.join(pkg.directory, "lib/tsserver.js");
  if (!fs.statSync(serverPath).isFile()) throw new Error(`No tsserver.js at ${serverPath}.`);
  const options = record(initializationOptions);
  const tsserver = record(options?.tsserver);
  return {
    initializationOptions: { ...options, tsserver: { ...tsserver, path: serverPath } },
    typescript: {
      backend: "tsserver",
      packageName: selected,
      compilerVersion: pkg.version,
      ...(wrapper?.version ? { wrapperVersion: wrapper.version } : {}),
    },
  };
}

function nativeLaunch(
  initializationOptions: unknown,
  pkg: CompilerPackage,
  selected: string,
): TypeScriptLaunch {
  const typescript: TypeScriptSelection = {
    backend: "native",
    packageName: selected,
    compilerVersion: pkg.version,
  };
  try {
    return {
      command: process.execPath,
      args: [nativeLauncher(pkg), "--lsp", "--stdio"],
      initializationOptions,
      typescript,
    };
  } catch (error) {
    throw new TypeScriptLaunchError(error instanceof Error ? error.message : String(error), {
      cause: error,
      typescript,
    });
  }
}

function nativeLauncher(pkg: CompilerPackage): string {
  const executable = record(pkg.bin)?.tsc;
  if (typeof executable !== "string" || !executable || path.isAbsolute(executable))
    throw new Error(
      `Native package at ${pkg.directory} must declare a relative bin.tsc executable.`,
    );
  const launcher = path.resolve(pkg.directory, executable);
  const relative = path.relative(pkg.directory, launcher);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || !fs.statSync(launcher).isFile())
    throw new Error(`Invalid native tsc executable at ${launcher}.`);
  return launcher;
}

/** Non-throwing selection probe shared by discovery and missing-server reporting. */
export function inspectTypeScriptLaunch(
  name: string,
  config: ServerConfig,
  root: string,
): Pick<TypeScriptLaunch, "typescript"> & { command: string; failureMessage?: string } {
  try {
    const { command, typescript } = resolveTypeScriptLaunch(name, config, root);
    return { command: command ?? config.command, ...(typescript ? { typescript } : {}) };
  } catch (error) {
    const typescript = error instanceof TypeScriptLaunchError ? error.typescript : undefined;
    return {
      command: typescript?.backend === "native" ? process.execPath : config.command,
      ...(typescript ? { typescript } : {}),
      failureMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
