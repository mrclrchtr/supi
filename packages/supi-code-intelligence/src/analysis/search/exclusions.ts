import type { CodeQueryPartialMetadata } from "@mrclrchtr/supi-code-runtime/api";
import { toDisplayPath } from "./paths.ts";

/** Excluded provider observations, distinct from navigable canonical source locations. */
export interface AutomaticPathExclusionDisplay {
  readonly excludedCount: number;
  readonly examples: readonly {
    /** Original policy observation; intentionally not canonicalized. */
    readonly observedPath: string;
    /** Canonical workspace-relative or external absolute navigation path. */
    readonly canonicalPath: string;
  }[];
}

/** Project typed exclusion evidence without rewriting provider prose or source identities. */
export function displayAutomaticPathExclusion(
  exclusion: CodeQueryPartialMetadata["automaticPathExclusion"],
  cwd: string,
): AutomaticPathExclusionDisplay | undefined {
  return exclusion
    ? {
        excludedCount: exclusion.excludedCount,
        examples: exclusion.examples.map((observedPath) => ({
          observedPath,
          canonicalPath: toDisplayPath(cwd, observedPath),
        })),
      }
    : undefined;
}

/** Examples named in prose; structured output keeps every collected example. */
const MAX_PROSE_EXAMPLES = 2;

/**
 * Explain which observed path was excluded even when a matching canonical source was retained.
 * A path that is already canonical is named once.
 */
export function describeExcludedPath(
  example: AutomaticPathExclusionDisplay["examples"][number],
): string {
  return example.observedPath === example.canonicalPath
    ? `\`${example.canonicalPath}\``
    : `observed \`${example.observedPath}\` → canonical \`${example.canonicalPath}\``;
}

/** Render the bounded ` Excluded path examples: …` suffix, or an empty string without examples. */
export function describeExcludedPathExamples(exclusion: AutomaticPathExclusionDisplay): string {
  if (exclusion.examples.length === 0) return "";
  const shown = exclusion.examples.slice(0, MAX_PROSE_EXAMPLES).map(describeExcludedPath);
  return ` Excluded path examples: ${shown.join(", ")}.`;
}

/** Preserve provider failure reasons and append path explanations from typed metadata only. */
export function describePartialQuery(
  reason: string,
  metadata: CodeQueryPartialMetadata | undefined,
  cwd: string,
): string {
  const exclusion = displayAutomaticPathExclusion(metadata?.automaticPathExclusion, cwd);
  return exclusion ? `${reason}${describeExcludedPathExamples(exclusion)}` : reason;
}
