import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { major, valid } from "semver";
import type { ServerConfig, TypeScriptSelection } from "./server-config.ts";

interface CompilerPackage {
  directory: string;
  name?: string;
  version?: string;
}

/** Launch options and truthful compiler facts for one root; never cached across starts. */
export interface TypeScriptLaunch {
  initializationOptions: unknown;
  typescript?: TypeScriptSelection;
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
    let pkg = findPackage(selected, root);
    if (!pkg && selector === undefined) {
      selected = "@typescript/typescript6";
      pkg = findPackage(selected, root);
    }
    if (!pkg) {
      if (selector !== undefined) throw new Error("Selected package is not installed.");
      return unchanged; // Preserve TLS's legacy lookup when neither candidate exists.
    }
    return compilerLaunch(config.initializationOptions, pkg, selected);
  } catch (error) {
    throw new Error(
      `TypeScript launch at ${root}, package "${selected}": ${error instanceof Error ? error.message : String(error)} Repair/install the selected TS6 package, or use explicit launch configuration; then refresh health. Reload after changing launch settings.`,

      { cause: error },
    );
  }
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

function compilerLaunch(
  initializationOptions: unknown,
  selectedPackage: CompilerPackage,
  selected: string,
): TypeScriptLaunch {
  let pkg = selectedPackage;
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
  if (major(pkg.version) >= 7 || pkg.name?.startsWith("@typescript/native")) {
    throw new Error(
      `Unsupported automatic TypeScript backend ${pkg.name ?? selected} ${pkg.version ?? "(unknown version)"}. Select an installed TS6 package with typescriptPackage, or configure command/args manually for a native server.`,
    );
  }
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

/** Non-throwing selection probe shared by discovery and missing-server reporting. */
export function inspectTypeScriptLaunch(
  name: string,
  config: ServerConfig,
  root: string,
): Pick<TypeScriptLaunch, "typescript"> & { failureMessage?: string } {
  try {
    const { typescript } = resolveTypeScriptLaunch(name, config, root);
    return typescript ? { typescript } : {};
  } catch (error) {
    return { failureMessage: error instanceof Error ? error.message : String(error) };
  }
}
