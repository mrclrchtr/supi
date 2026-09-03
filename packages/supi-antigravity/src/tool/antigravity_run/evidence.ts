import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, normalize as normalizePath, relative, resolve } from "node:path";
import { hashEvidence } from "../../process/event-values.ts";
import type {
  AntigravityAnswer,
  AntigravityExecutionFacts,
  ClassifiedSource,
  ClassifiedWorkspaceEvidence,
} from "../../types.ts";

/** Evidence split and safe warnings produced from one Antigravity answer. */
export interface ClassifiedEvidence {
  observedSources: ClassifiedSource[];
  claimedSources: ClassifiedSource[];
  observedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  claimedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  warnings: string[];
}

/** Validate references, classify observed facts, and omit unsafe references. */
export function classifyAnswerEvidence(
  answer: AntigravityAnswer,
  facts: Pick<AntigravityExecutionFacts, "observedSourceHashes" | "observedWorkspacePathHashes">,
  workspaceDirectory: string,
): ClassifiedEvidence {
  const sources = classifySources(answer.sources, new Set(facts.observedSourceHashes));
  const workspace = classifyWorkspaceEvidence(
    answer.workspaceEvidence,
    new Set(facts.observedWorkspacePathHashes),
    workspaceDirectory,
  );
  return {
    observedSources: sources.observed,
    claimedSources: sources.claimed,
    observedWorkspaceEvidence: workspace.observed,
    claimedWorkspaceEvidence: workspace.claimed,
    warnings: [...new Set([...sources.warnings, ...workspace.warnings])],
  };
}

interface ClassifiedSourceLists {
  observed: ClassifiedSource[];
  claimed: ClassifiedSource[];
  warnings: string[];
}

function classifySources(
  sources: readonly AntigravityAnswer["sources"][number][],
  observedHashes: ReadonlySet<string>,
): ClassifiedSourceLists {
  const result: ClassifiedSourceLists = { observed: [], claimed: [], warnings: [] };
  for (const source of sources) {
    const url = source.url.trim();
    if (!isHttpUrl(url) || !source.title.trim()) {
      result.warnings.push("Some source references were omitted because they were invalid.");
      continue;
    }
    const classified: ClassifiedSource = {
      title: source.title.trim(),
      url,
      evidence: observedHashes.has(hashEvidence(url)) ? "observed" : "claimed",
    };
    addClassified(result, classified);
  }
  return result;
}

function classifyWorkspaceEvidence(
  evidence: readonly AntigravityAnswer["workspaceEvidence"][number][],
  observedHashes: ReadonlySet<string>,
  workspaceDirectory: string,
): {
  observed: ClassifiedWorkspaceEvidence[];
  claimed: ClassifiedWorkspaceEvidence[];
  warnings: string[];
} {
  const result = { observed: [], claimed: [], warnings: [] } as {
    observed: ClassifiedWorkspaceEvidence[];
    claimed: ClassifiedWorkspaceEvidence[];
    warnings: string[];
  };
  for (const item of evidence) {
    if (!isSafeWorkspacePath(item.path, workspaceDirectory) || !item.summary.trim()) {
      result.warnings.push(
        "Some workspace references were omitted because they were outside the selected workspace.",
      );
      continue;
    }
    const normalizedPath = normalizeWorkspacePath(item.path);
    const classified: ClassifiedWorkspaceEvidence = {
      path: normalizedPath,
      summary: item.summary.trim(),
      evidence: observedHashes.has(hashEvidence(normalizedPath)) ? "observed" : "claimed",
    };
    if (classified.evidence === "observed") result.observed.push(classified);
    else result.claimed.push(classified);
  }
  return result;
}

function addClassified(result: ClassifiedSourceLists, source: ClassifiedSource): void {
  if (source.evidence === "observed") result.observed.push(source);
  else result.claimed.push(source);
}

/** Accept only HTTP and HTTPS source URLs. */
export function isHttpUrl(value: string): boolean {
  if (hasControlCharacters(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Check that a returned path is relative and contained by a workspace. */
export function isSafeWorkspacePath(value: string, workspaceDirectory: string): boolean {
  if (
    !value ||
    hasControlCharacters(value) ||
    value.startsWith("~") ||
    isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    return false;
  }
  const candidate = normalizeWorkspacePath(value);
  if (candidate === "." || candidate === ".." || candidate.startsWith("../")) return false;
  const resolvedWorkspace = safeRealpath(workspaceDirectory);
  const resolvedCandidate = resolve(resolvedWorkspace, candidate);
  if (!isContainedPath(resolvedWorkspace, resolvedCandidate)) return false;
  const existingAncestor = findExistingAncestor(resolvedCandidate);
  return isContainedPath(resolvedWorkspace, safeRealpath(existingAncestor));
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizeWorkspacePath(value: string): string {
  return normalizePath(value.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function safeRealpath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
}

function findExistingAncestor(value: string): string {
  let candidate = value;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return value;
    candidate = parent;
  }
  return candidate;
}

function isContainedPath(workspace: string, candidate: string): boolean {
  const distance = relative(workspace, candidate);
  return distance !== ".." && !distance.startsWith("../") && !isAbsolute(distance);
}
