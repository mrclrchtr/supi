/**
 * Session-owned Target workflow.
 *
 * Turns one exact target selector into immutable resolved-target facts before
 * graph, Orientation, resolve, or refactor analysis begins.
 */

import { existsSync } from "node:fs";
import { normalizePath, resolveScope } from "../analysis/search/ripgrep.ts";
import { resolveAnchoredSymbolTarget } from "../analysis/target/anchored.ts";
import { resolveFileTargetGroup } from "../analysis/target/file.ts";
import { resolveSymbolTarget } from "../analysis/target/symbol.ts";
import type { ResolvedTargetData, TargetOutcome } from "../analysis/target/types.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { parseTargetInput } from "./input/common.ts";
import type { TargetInput } from "./target-input.ts";
import type {
  AnchorKind,
  TargetLookupResult,
  TargetRegistrationInput,
  TargetRegistrationOutput,
  TargetStoreEntry,
} from "./target-store.ts";

export type { TargetInput } from "./target-input.ts";

/** Target workflow policy selected by the intent-level session entry. */
export interface TargetWorkflowPolicy {
  /** Whether a file-level selector is valid for this intent. */
  readonly fileLevelAllowed: boolean;
  /** Whether a strict name anchor is required. */
  readonly nameAnchorRequired: boolean;
  /** Whether semantic readiness should be awaited before provider-backed resolution. */
  readonly waitForSemantic: boolean;
  /** Maximum displayed disambiguation candidates. */
  readonly maxResults?: number;
}

/** Typed Target workflow outcome. */
export type TargetWorkflowOutcome =
  | { kind: "resolved"; entry: Readonly<TargetStoreEntry>; notes: readonly string[] }
  | {
      kind: "disambiguation";
      candidates: ReadonlyArray<{
        targetId: string;
        name: string;
        kind: string | null;
        container: string | null;
        file: string;
        line: number;
        character: number;
        rank: number;
        anchorKind: AnchorKind;
      }>;
      omittedCount: number;
    }
  | { kind: "invalid-input"; message: string }
  | { kind: "unavailable"; reason: string };

/** Dependencies hidden behind the Workspace code-intelligence session seam. */
export interface TargetWorkflowDeps {
  readonly cwd: string;
  readonly capability: CapabilityAdapter;
  readonly lookupTargetId: (targetId: string) => TargetLookupResult;
  readonly registerTarget: (input: TargetRegistrationInput) => TargetRegistrationOutput;
}

/** Resolve exactly one canonical selector into target facts or a typed failure. */
export async function resolveTargetWorkflow(
  input: TargetInput,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  const parsed = parseTargetInput(input, ["handle", "anchor", "symbol", "file"]);
  if (parsed.kind === "invalid-input") return parsed;
  const target = parsed.value;

  if ("handle" in target) {
    return resolveHandle(target.handle, policy, deps);
  }
  if ("anchor" in target) {
    return resolveAnchoredWorkflow(target.anchor, policy, deps);
  }
  if ("symbol" in target) {
    return resolveSymbolWorkflow(target.symbol, policy, deps);
  }
  if (!policy.fileLevelAllowed) {
    return {
      kind: "invalid-input",
      message: "This workflow requires a handle, anchored point, or symbol target.",
    };
  }
  return resolveFileOnlyWorkflow(target.file, deps);
}

function resolveHandle(
  handle: string,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): TargetWorkflowOutcome {
  const result = deps.lookupTargetId(handle);
  if (result.kind === "unavailable") {
    return { kind: "invalid-input", message: result.reason };
  }
  if (policy.nameAnchorRequired && result.entry.anchorKind === "declaration") {
    return {
      kind: "invalid-input",
      message:
        "The target has a declaration anchor rather than the required name anchor. " +
        "Resolve an identifier coordinate with code_resolve and retry.",
    };
  }
  return { kind: "resolved", entry: immutableEntry(result.entry), notes: [] };
}

async function resolveAnchoredWorkflow(
  anchor: { file: string; line: number; character: number },
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  const file = normalizePath(anchor.file, deps.cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${anchor.file}\`` };
  }

  if (policy.waitForSemantic) {
    const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
      kind: "file",
      file,
    });
    if (readiness.kind === "timeout") {
      return {
        kind: "unavailable",
        reason: "LSP readiness timed out. Retry shortly or inspect code_health.",
      };
    }
    if (readiness.kind === "unavailable") {
      return { kind: "unavailable", reason: readiness.reason };
    }
  }

  const outcome = await resolveAnchoredSymbolTarget(
    file,
    anchor.line,
    anchor.character,
    deps.capability.getProvider(deps.cwd),
  );
  return toWorkflowOutcome(outcome, policy, deps);
}

async function resolveSymbolWorkflow(
  symbol: { query: string; scope?: string; symbolKind?: string },
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  if (!symbol.query.trim()) {
    return { kind: "invalid-input", message: "Symbol query must not be empty." };
  }

  let scope: string | undefined;
  if (symbol.scope !== undefined) {
    const resolved = resolveScope(symbol.scope, deps.cwd);
    if (resolved.kind === "error") {
      return { kind: "invalid-input", message: resolved.reason };
    }
    scope = resolved.path;
  }

  let provider = deps.capability.getSemanticProvider(deps.cwd);
  if (!provider && policy.waitForSemantic) {
    const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
      kind: "workspace",
    });
    if (readiness.kind === "timeout") {
      return { kind: "unavailable", reason: "LSP readiness timed out. Retry shortly." };
    }
    if (readiness.kind === "unavailable") {
      return { kind: "unavailable", reason: readiness.reason };
    }
    provider = deps.capability.getSemanticProvider(deps.cwd);
  }

  if (!provider) {
    return {
      kind: "unavailable",
      reason: "Symbol resolution requires an active semantic provider.",
    };
  }

  const outcome = await resolveSymbolTarget(symbol.query, deps.cwd, provider, {
    path: scope,
    kind: symbol.symbolKind,
    maxResults: policy.maxResults,
  });
  return toWorkflowOutcome(outcome, policy, deps);
}

async function resolveFileOnlyWorkflow(
  requestedFile: string,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  const file = normalizePath(requestedFile, deps.cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${requestedFile}\`` };
  }

  const result = await resolveFileTargetGroup(file, deps.cwd, {
    semantic: deps.capability.getSemanticProvider(deps.cwd) ?? undefined,
    structural: deps.capability.getStructuralProvider(deps.cwd) ?? undefined,
  });
  if (result.kind === "error") {
    return { kind: "invalid-input", message: result.message };
  }

  const group = result.group;
  const registered = deps.registerTarget({
    file: group.file,
    position: { line: 0, character: 0 },
    displayLine: 1,
    displayCharacter: 1,
    name: group.displayName ?? null,
    kind: null,
    confidence: "structural",
    provenance: "file-level",
    anchorKind: "name",
    container: null,
  });
  return { kind: "resolved", entry: immutableEntry(registered.entry), notes: [] };
}

function toWorkflowOutcome(
  outcome: TargetOutcome,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): TargetWorkflowOutcome {
  if (outcome.kind === "error") {
    return { kind: "invalid-input", message: outcome.message };
  }

  if (outcome.kind === "resolved") {
    if (policy.nameAnchorRequired && outcome.target.anchorKind === "declaration") {
      return {
        kind: "invalid-input",
        message:
          "The target resolved only to a declaration anchor. Resolve the identifier coordinate and retry.",
      };
    }
    const registered = registerFromTargetData(outcome.target, deps);
    return {
      kind: "resolved",
      entry: immutableEntry(registered.entry),
      notes: buildResolutionNotes(outcome.target),
    };
  }

  if (outcome.kind === "group") {
    return {
      kind: "invalid-input",
      message: "This workflow requires one precise target rather than a file target group.",
    };
  }

  const candidates = outcome.candidates.map((candidate, index) => {
    const registered = deps.registerTarget({
      file: candidate.file,
      position: { line: candidate.line - 1, character: candidate.character - 1 },
      displayLine: candidate.line,
      displayCharacter: candidate.character,
      name: candidate.name,
      kind: candidate.kind,
      confidence: "semantic",
      provenance: "symbol-query",
      anchorKind: candidate.anchorKind ?? "declaration",
      container: candidate.container,
    });
    return Object.freeze({
      targetId: registered.targetId,
      name: candidate.name,
      kind: candidate.kind,
      container: candidate.container,
      file: candidate.file,
      line: candidate.line,
      character: candidate.character,
      rank: index + 1,
      anchorKind: candidate.anchorKind ?? ("declaration" as const),
    });
  });
  return {
    kind: "disambiguation",
    candidates: Object.freeze(candidates),
    omittedCount: outcome.omittedCount,
  };
}

function buildResolutionNotes(target: ResolvedTargetData): readonly string[] {
  const notes: string[] = [];
  if (target.resolution?.snapped) {
    notes.push(
      `Resolved from a declaration header and snapped to the identifier (${target.resolution.source}).`,
    );
  }
  if (target.resolution?.source === "structural-identifier") {
    notes.push("Resolved from provider-backed structural identifier evidence.");
  }
  return Object.freeze(notes);
}

function registerFromTargetData(
  target: ResolvedTargetData,
  deps: TargetWorkflowDeps,
): TargetRegistrationOutput {
  return deps.registerTarget({
    file: target.file,
    position: target.position,
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    confidence: target.confidence,
    provenance: "target-workflow",
    anchorKind: target.anchorKind,
    container: target.container,
    resolution: target.resolution,
  });
}

function immutableEntry(entry: TargetStoreEntry): Readonly<TargetStoreEntry> {
  return Object.freeze({
    ...entry,
    position: Object.freeze({ ...entry.position }),
    resolution: entry.resolution
      ? Object.freeze({
          ...entry.resolution,
          requested: Object.freeze({ ...entry.resolution.requested }),
          resolved: Object.freeze({ ...entry.resolution.resolved }),
        })
      : undefined,
  });
}
