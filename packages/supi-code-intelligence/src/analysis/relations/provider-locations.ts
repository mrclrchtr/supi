import * as path from "node:path";
import { uriToFile } from "@mrclrchtr/supi-core/path";

/** Why a provider-backed relation location could not be included as evidence. */
export type RelationLocationPartialReason = "invalid-provider-location";

interface ProviderPositionLike {
  readonly line?: number;
  readonly character?: number;
}

interface ProviderRangeLike {
  readonly start?: ProviderPositionLike;
}

/** Location shapes accepted from semantic providers, including LSP LocationLink fields. */
export interface ProviderLocationLike {
  readonly uri?: string;
  readonly targetUri?: string;
  readonly range?: ProviderRangeLike;
  readonly targetSelectionRange?: ProviderRangeLike;
  readonly targetRange?: ProviderRangeLike;
}

/** One canonical absolute provider location with a 1-based display position. */
export interface NormalizedProviderLocation {
  readonly file: string;
  readonly line: number;
  readonly character: number;
}

/** Canonical provider locations partitioned without treating invalid data as external evidence. */
export interface NormalizedProviderLocations {
  readonly project: readonly NormalizedProviderLocation[];
  readonly external: readonly NormalizedProviderLocation[];
  readonly invalidLocationCount: number;
  readonly partialReason: RelationLocationPartialReason | null;
}

/**
 * Normalize, validate, deduplicate, order, and classify semantic-provider locations.
 * Invalid locations are counted separately because they establish neither project nor external facts.
 */
export function normalizeProviderLocations(
  locations: readonly ProviderLocationLike[],
  cwd: string,
): NormalizedProviderLocations {
  const flavor = pathFlavor(cwd);
  const projectRoot = normalizeAbsolutePath(cwd, flavor);
  const unique = new Map<string, NormalizedProviderLocation>();
  let invalidLocationCount = 0;

  for (const location of locations) {
    const normalized = normalizeProviderLocation(location, flavor);
    if (!normalized) {
      invalidLocationCount++;
      continue;
    }
    const key = locationKey(normalized);
    const existing = unique.get(key);
    if (!existing || compareLocations(normalized, existing) < 0) {
      unique.set(key, normalized);
    }
  }

  const project: NormalizedProviderLocation[] = [];
  const external: NormalizedProviderLocation[] = [];
  for (const location of [...unique.values()].sort(compareLocations)) {
    (isProjectLocation(projectRoot, location.file, flavor) ? project : external).push(location);
  }

  return {
    project,
    external,
    invalidLocationCount,
    partialReason: invalidLocationCount > 0 ? "invalid-provider-location" : null,
  };
}

/** Normalize a target path for exact declaration-location comparisons. */
export function normalizeTargetFile(file: string, cwd: string): string {
  const flavor = pathFlavor(cwd);
  const pathApi = flavor === "windows" ? path.win32 : path.posix;
  return pathApi.normalize(pathApi.isAbsolute(file) ? file : pathApi.resolve(cwd, file));
}

/** Compare a normalized provider location with a zero-based target anchor. */
export function isTargetLocation(
  location: NormalizedProviderLocation,
  targetFile: string,
  targetPosition: { readonly line: number; readonly character: number },
): boolean {
  return (
    pathsEqual(location.file, targetFile) &&
    location.line === targetPosition.line + 1 &&
    location.character === targetPosition.character + 1
  );
}

type PathFlavor = "posix" | "windows";

function normalizeProviderLocation(
  location: ProviderLocationLike,
  flavor: PathFlavor,
): NormalizedProviderLocation | null {
  const uri = location.uri ?? location.targetUri;
  const start =
    location.targetSelectionRange?.start ?? location.targetRange?.start ?? location.range?.start;
  if (!uri || !isProviderPosition(start)) return null;

  let file: string;
  try {
    file = uriToFile(uri);
  } catch {
    return null;
  }
  if (flavor === "windows" && /^\/[A-Za-z]:[\\/]/.test(file)) {
    file = file.slice(1);
  }
  const pathApi = flavor === "windows" ? path.win32 : path.posix;
  if (!file || !pathApi.isAbsolute(file)) return null;

  return {
    file: pathApi.normalize(file),
    line: start.line + 1,
    character: start.character + 1,
  };
}

function isProviderPosition(value: ProviderPositionLike | undefined): value is {
  line: number;
  character: number;
} {
  return (
    value !== undefined &&
    typeof value.line === "number" &&
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    typeof value.character === "number" &&
    Number.isInteger(value.character) &&
    value.character >= 0
  );
}

function pathFlavor(file: string): PathFlavor {
  return /^[A-Za-z]:[\\/]/.test(file) || file.startsWith("\\\\") ? "windows" : "posix";
}

function normalizeAbsolutePath(file: string, flavor: PathFlavor): string {
  const pathApi = flavor === "windows" ? path.win32 : path.posix;
  return pathApi.normalize(pathApi.resolve(file));
}

function isProjectLocation(root: string, file: string, flavor: PathFlavor): boolean {
  const pathApi = flavor === "windows" ? path.win32 : path.posix;
  const relative = pathApi.relative(root, file);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative))
  );
}

function pathsEqual(left: string, right: string): boolean {
  if (pathFlavor(left) === "windows" || pathFlavor(right) === "windows") {
    return path.win32.relative(left, right) === "";
  }
  return left === right;
}

function locationKey(location: NormalizedProviderLocation): string {
  const fileKey =
    pathFlavor(location.file) === "windows" ? location.file.toLowerCase() : location.file;
  return `${fileKey}\0${location.line}\0${location.character}`;
}

function compareLocations(a: NormalizedProviderLocation, b: NormalizedProviderLocation): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line || a.character - b.character;
}
