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

/** Explain which observed path was excluded even when a matching canonical source was retained. */
export function describeExcludedPath(
  example: AutomaticPathExclusionDisplay["examples"][number],
): string {
  return `observed \`${example.observedPath}\` → canonical \`${example.canonicalPath}\``;
}

/** Preserve provider failure reasons and append path explanations from typed metadata only. */
export function describePartialQuery(
  reason: string,
  metadata: CodeQueryPartialMetadata | undefined,
  cwd: string,
): string {
  const exclusion = displayAutomaticPathExclusion(metadata?.automaticPathExclusion, cwd);
  if (!exclusion?.examples.length) return reason;
  return `${reason} Excluded path examples: ${exclusion.examples.map(describeExcludedPath).join(", ")}.`;
}
