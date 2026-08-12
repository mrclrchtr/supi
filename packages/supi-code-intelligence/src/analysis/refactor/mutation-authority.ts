import { lstatSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

export type MutationAuthorityResult =
  | { kind: "authorized"; canonicalRoots: string[] }
  | { kind: "unavailable"; reason: string };

/**
 * Establish canonical provider roots and verify that all mutation files are
 * regular files inside at least one root.
 */
export function establishMutationAuthority(
  files: readonly string[],
  providerRoots: readonly string[],
): MutationAuthorityResult {
  const roots = canonicalizeProviderRoots(providerRoots);
  if (roots.kind === "unavailable") return roots;

  const fileValidation = validateFiles(files, roots.canonicalRoots);
  return fileValidation.kind === "unavailable" ? fileValidation : roots;
}

/** Revalidate stored canonical roots and mutation files immediately before mutation. */
export function revalidateMutationAuthority(
  files: readonly string[],
  canonicalRoots: readonly string[],
): MutationAuthorityResult {
  if (canonicalRoots.length === 0) {
    return { kind: "unavailable", reason: "Mutation plan has no authorized provider root." };
  }

  for (const root of canonicalRoots) {
    if (!path.isAbsolute(root) || path.normalize(root) !== root) {
      return { kind: "unavailable", reason: `Stored mutation root "${root}" is not canonical.` };
    }
    try {
      if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) {
        return { kind: "unavailable", reason: `Stored mutation root "${root}" has changed.` };
      }
    } catch {
      return { kind: "unavailable", reason: `Stored mutation root "${root}" is unavailable.` };
    }
  }

  return validateFiles(files, canonicalRoots);
}

function canonicalizeProviderRoots(providerRoots: readonly string[]): MutationAuthorityResult {
  if (providerRoots.length === 0) {
    return { kind: "unavailable", reason: "Semantic route did not authorize a mutation root." };
  }

  const canonicalRoots = new Set<string>();
  for (const root of providerRoots) {
    if (!path.isAbsolute(root)) {
      return { kind: "unavailable", reason: `Mutation root "${root}" is not absolute.` };
    }
    try {
      const canonicalRoot = realpathSync(root);
      if (!statSync(canonicalRoot).isDirectory()) {
        return {
          kind: "unavailable",
          reason: `Mutation root "${root}" is not a directory.`,
        };
      }
      canonicalRoots.add(canonicalRoot);
    } catch {
      return {
        kind: "unavailable",
        reason: `Mutation root "${root}" cannot be resolved to a canonical directory.`,
      };
    }
  }

  return { kind: "authorized", canonicalRoots: [...canonicalRoots].sort() };
}

function validateFiles(
  files: readonly string[],
  canonicalRoots: readonly string[],
): MutationAuthorityResult {
  for (const file of new Set(files)) {
    const validation = validateFile(file, canonicalRoots);
    if (validation) return { kind: "unavailable", reason: validation };
  }
  return { kind: "authorized", canonicalRoots: [...canonicalRoots] };
}

function validateFile(file: string, canonicalRoots: readonly string[]): string | null {
  if (!path.isAbsolute(file) || path.normalize(file) !== file) {
    return `Mutation file "${file}" is not a normalized absolute path.`;
  }

  let canonicalParent: string;
  try {
    canonicalParent = realpathSync(path.dirname(file));
  } catch {
    return `Mutation file "${file}" does not have a resolvable canonical parent.`;
  }

  try {
    if (!lstatSync(file).isFile()) {
      return `Mutation file "${file}" is not a regular file.`;
    }
  } catch {
    return `Mutation file "${file}" is not a readable regular file.`;
  }

  let canonicalFile: string;
  try {
    canonicalFile = realpathSync(file);
  } catch {
    return `Mutation file "${file}" cannot be resolved to a canonical file.`;
  }

  const expectedCanonicalFile = path.join(canonicalParent, path.basename(file));
  if (path.resolve(canonicalFile) !== path.resolve(expectedCanonicalFile)) {
    return `Mutation file "${file}" resolves through an unsupported file link.`;
  }
  if (!canonicalRoots.some((root) => isWithinOrEqual(root, canonicalFile))) {
    return `Mutation file "${file}" is outside the authorized provider roots.`;
  }
  return null;
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  return isMutationPathWithinRoot(root, candidate, path);
}

/** Check canonical path containment with the selected platform path rules. */
export function isMutationPathWithinRoot(
  root: string,
  candidate: string,
  pathApi: Pick<typeof path, "isAbsolute" | "relative" | "sep">,
): boolean {
  const difference = pathApi.relative(root, candidate);
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(difference))
  );
}
