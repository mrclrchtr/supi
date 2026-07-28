/** Package.json reading and field-preserving fact extraction. */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ManifestDependency,
  ManifestDependencyField,
  ManifestDependencySection,
  ManifestField,
  ModuleInfo,
  PackageManifestObservation,
} from "./model.ts";

export const PACKAGE_MANIFEST = "package.json";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const satisfies readonly ManifestDependencyField[];
const OTHER_MANIFEST_FIELDS = [
  "workspaces",
  "main",
  "module",
  "exports",
  "bin",
  "bundledDependencies",
  "bundleDependencies",
  "peerDependenciesMeta",
] as const;

/** Parsed JSON object from one package manifest. */
export interface PackageJson extends Record<string, unknown> {}

/** Read outcome that distinguishes an absent manifest from an unreadable or malformed one. */
export type PackageJsonRead =
  | { readonly kind: "complete"; readonly value: PackageJson }
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Read one package.json without turning absent or malformed data into an empty manifest. */
export function readPackageJson(directory: string): PackageJsonRead {
  const manifestPath = path.join(directory, PACKAGE_MANIFEST);
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf-8");
  } catch (error) {
    if (isErrno(error, "ENOENT"))
      return { kind: "missing", reason: `No ${PACKAGE_MANIFEST} found.` };
    return {
      kind: "unavailable",
      reason: `Could not read ${PACKAGE_MANIFEST}: ${errorMessage(error)}`,
    };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      return { kind: "unavailable", reason: `${PACKAGE_MANIFEST} must contain a JSON object.` };
    }
    return { kind: "complete", value };
  } catch (error) {
    return {
      kind: "unavailable",
      reason: `Could not parse ${PACKAGE_MANIFEST}: ${errorMessage(error)}`,
    };
  }
}

/** Build a root-manifest observation from one package.json read outcome. */
export function toRootManifestObservation(
  read: PackageJsonRead,
  packageInfo: ModuleInfo | null,
): PackageManifestObservation {
  return {
    status: read.kind === "complete" ? "complete" : "unavailable",
    path: PACKAGE_MANIFEST,
    reason: read.kind === "complete" ? null : read.reason,
    package: packageInfo,
  };
}

/** Extract only field-preserving package facts from a successfully parsed manifest. */
export function toModuleInfo(manifest: PackageJson, directory: string, root: string): ModuleInfo {
  const relativePath = toRelativePath(root, directory);
  const manifestPath =
    relativePath === "." ? PACKAGE_MANIFEST : `${relativePath}/${PACKAGE_MANIFEST}`;
  return {
    name: stringValue(manifest.name),
    description: stringValue(manifest.description),
    root: directory,
    relativePath,
    manifestPath,
    fields: collectManifestFields(manifest),
    dependencySections: collectDependencySections(manifest),
  };
}

function collectManifestFields(manifest: PackageJson): ManifestField[] {
  const fields: ManifestField[] = [];
  for (const field of OTHER_MANIFEST_FIELDS) {
    if (Object.hasOwn(manifest, field)) fields.push({ field, value: manifest[field] });
  }
  if (isRecord(manifest.pi) && Object.hasOwn(manifest.pi, "extensions")) {
    fields.push({ field: "pi.extensions", value: manifest.pi.extensions });
  }
  for (const field of DEPENDENCY_FIELDS) {
    if (Object.hasOwn(manifest, field) && !isRecord(manifest[field])) {
      fields.push({ field, value: manifest[field] });
    }
  }
  return fields;
}

function collectDependencySections(manifest: PackageJson): ManifestDependencySection[] {
  const sections: ManifestDependencySection[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (!isRecord(value)) continue;
    const entries: ManifestDependency[] = Object.entries(value)
      .map(([name, specifier]) => ({ field, name, specifier }))
      .sort((left, right) => left.name.localeCompare(right.name));
    sections.push({ field, entries });
  }
  return sections;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRelativePath(root: string, target: string): string {
  const relative = path.relative(root, target);
  return relative.length === 0 ? "." : relative.replaceAll(path.sep, "/");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
