// supi-core project domain — project root discovery and traversal.
export type { KnownRootEntry } from "./project-roots.ts";
export {
  buildKnownRootsMap,
  byPathDepth,
  dedupeTopmostRoots,
  findProjectRoot,
  isWithin,
  isWithinOrEqual,
  mergeKnownRoots,
  resolveKnownRoot,
  segmentCount,
  sortRootsBySpecificity,
  walkProject,
} from "./project-roots.ts";
