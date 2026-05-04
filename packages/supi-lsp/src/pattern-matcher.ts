/** Gitignore-style glob pattern matching for path exclusion.
 *
 * Supports:
 *  - Literal names at any depth: __tests__, build
 *  - Trailing slash directory-only: __tests__ + "/"
 *  - Leading slash root-anchored: "/" + build
 *  - Stars-star-slash recursive: e.g. `**` + "/" + fixtures
 *  - Asterisk single-segment wildcard: *.generated.ts
 *  - Literal paths: packages + "/" + legacy
 */

/**
 * Normalize path separators to forward slashes and trim.
 */
function normalize(p: string): string {
  return p.replaceAll("\\", "/").trim();
}

/**
 * Check whether a project-relative file path matches a gitignore-style glob pattern.
 *
 * @param filePath - Relative file path with forward slashes (e.g. `"src/__tests__/bar.test.ts"`)
 * @param pattern - Gitignore-style glob pattern (e.g. `"__tests__/"`, `"*.test.ts"`, `"/build"`)
 * @returns `true` if the file path matches the pattern
 */
export function isGlobMatch(filePath: string, pattern: string): boolean {
  const fp = normalize(filePath);
  const pat = normalize(pattern);
  if (!fp || !pat) return false;

  // Leading / → anchored to root
  const anchored = pat.startsWith("/");
  const noLeadingSlash = anchored ? pat.slice(1) : pat;

  // Trailing / → directory-only
  const dirOnly = noLeadingSlash.endsWith("/");
  const cleanPat = dirOnly ? noLeadingSlash.slice(0, -1) : noLeadingSlash;

  if (!cleanPat) return false;

  return matchGlob(fp, cleanPat, { anchored, dirOnly });
}

interface MatchOptions {
  anchored: boolean;
  dirOnly: boolean;
}

/**
 * Core recursive pattern matching against a multi-segment path.
 */
function matchGlob(filePath: string, pattern: string, opts: MatchOptions): boolean {
  // Direct match
  if (!opts.anchored && !opts.dirOnly && filePath === pattern) return true;

  // Split into segments
  const pathSegments = filePath.split("/");
  const patternSegments = pattern.split("/");

  // ** recursive glob
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    return (
      matchGlob(filePath, suffix, { ...opts, anchored: false }) ||
      starStarMatch(pathSegments, suffix)
    );
  }

  // prefix/**/suffix bounded recursive glob
  const dstarIdx = pattern.indexOf("/**/");
  if (dstarIdx !== -1) {
    const prefix = pattern.slice(0, dstarIdx);
    const suffix = pattern.slice(dstarIdx + 4);
    return matchBoundedStar(pathSegments, prefix, suffix);
  }

  // Single-segment patterns
  if (patternSegments.length === 1 && !opts.anchored) {
    return matchSingleSegment(pathSegments, patternSegments[0], opts.dirOnly);
  }

  // Multi-segment: anchored or unanchored
  if (opts.anchored) {
    return matchSegments(pathSegments, patternSegments, opts.dirOnly);
  }

  // Unanchored multi-segment: try at each starting position
  return matchUnanchoredSegments(pathSegments, patternSegments, opts.dirOnly);
}

/**
 * Match a ** recursive suffix across directory levels.
 */
function starStarMatch(segments: string[], suffix: string): boolean {
  for (let i = 0; i < segments.length; i++) {
    const remaining = segments.slice(i).join("/");
    if (matchGlob(remaining, suffix, { anchored: false, dirOnly: false })) return true;
  }
  return false;
}

/** Match prefix plus star-star-slash plus suffix bounded recursive pattern. */
function matchBoundedStar(segments: string[], prefix: string, suffix: string): boolean {
  // Try to find a split point where left matches prefix and right matches suffix
  for (let i = 1; i < segments.length; i++) {
    const left = segments.slice(0, i).join("/");
    const right = segments.slice(i).join("/");
    if (
      matchGlob(left, prefix, { anchored: false, dirOnly: false }) &&
      matchGlob(right, suffix, { anchored: false, dirOnly: false })
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Match a single-segment pattern against path segments.
 */
function matchSingleSegment(segments: string[], patternSeg: string, dirOnly: boolean): boolean {
  const hasGlob = patternSeg.includes("*") || patternSeg.includes("?");

  if (hasGlob) {
    // Glob pattern matches any segment
    return segments.some((seg) => simpleMatch(seg, patternSeg));
  }

  // Literal segment name
  if (dirOnly) {
    // Match as directory: any segment except the last (file) one
    return segments.slice(0, -1).some((seg) => seg === patternSeg);
  }

  // Match any segment (file or directory)
  return segments.some((seg) => seg === patternSeg);
}

/**
 * Try to match multi-segment pattern at each start position.
 */
function matchUnanchoredSegments(segments: string[], pattern: string[], dirOnly: boolean): boolean {
  for (let i = 0; i < segments.length; i++) {
    if (matchSegments(segments.slice(i), pattern, dirOnly)) return true;
  }
  return false;
}

/** Match segments from start. Returns true if all pattern segments match contiguously. */
function matchSegments(segments: string[], pattern: string[], dirOnly: boolean): boolean {
  if (pattern.length > segments.length) return false;

  for (let i = 0; i < pattern.length; i++) {
    if (!matchSegmentAtIndex(segments, pattern, i)) return false;
  }

  // dirOnly: last matched segment must not be the last path segment
  if (dirOnly && pattern.length === segments.length) return false;

  return true;
}

/** Match a single pattern segment against the corresponding path segment. */
function matchSegmentAtIndex(segments: string[], pattern: string[], index: number): boolean {
  const patSeg = pattern[index];
  const pathSeg = segments[index];

  if (patSeg === "**") {
    // ** at end matches all remaining segments
    if (index === pattern.length - 1) return true;
    // Try rest of pattern from various positions
    for (let j = index; j < segments.length; j++) {
      if (matchSegments(segments.slice(j), pattern.slice(index + 1), false)) return true;
    }
    return false;
  }

  return simpleMatch(pathSeg, patSeg);
}

/**
 * Match a single path segment against a single pattern segment.
 * Supports `*` (any chars except `/`) and `?` (single char).
 */
function simpleMatch(segment: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === segment) return true;
  if (!pattern.includes("*") && !pattern.includes("?")) return false;

  // Convert pattern to simple regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");

  return new RegExp(`^${regexStr}$`).test(segment);
}
