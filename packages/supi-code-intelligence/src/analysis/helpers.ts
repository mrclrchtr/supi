import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { ResolvedTargetData, ResolvedTargetGroupData } from "../targeting/types.ts";

interface FileLineRef {
  file: string;
  line: number;
}

export function isResolvedTargetGroup(
  target: ResolvedTargetData | ResolvedTargetGroupData,
): target is ResolvedTargetGroupData {
  return "targets" in target;
}

export function highestConfidence(confidences: ConfidenceMode[]): ConfidenceMode {
  if (confidences.includes("semantic")) return "semantic";
  if (confidences.includes("structural")) return "structural";
  if (confidences.includes("heuristic")) return "heuristic";
  return "unavailable";
}

export function dedupeFileLineRefs<T extends FileLineRef>(refs: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const ref of refs) {
    deduped.set(`${ref.file}:${ref.line}`, ref);
  }
  return [...deduped.values()];
}
