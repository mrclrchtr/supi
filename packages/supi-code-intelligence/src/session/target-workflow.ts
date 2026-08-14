/**
 * Session-owned Target workflow.
 *
 * Turns one exact target selector into immutable resolved-target facts before
 * graph, Orientation, resolve, or refactor analysis begins.
 */
// biome-ignore lint/style/noExcessiveLinesPerFile: target workflow keeps anchored, symbol, and file resolution together.
import { existsSync } from "node:fs";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { withSemanticRequestControl, withStructuralRequestControl } from "../analysis/provider.ts";
import { normalizePath, resolveScope } from "../analysis/search/paths.ts";
import { resolveAnchoredSymbolTarget } from "../analysis/target/anchored.ts";
import { resolveFileTargetGroup, validateFileTargetDiscovery } from "../analysis/target/file.ts";
import {
  canonicalDeclarationKind,
  refineTargetOutcomeIdentity,
} from "../analysis/target/identity.ts";
import { resolveSymbolTarget } from "../analysis/target/symbol.ts";
import type {
  ResolvedTargetData,
  ResolvedTargetGroupData,
  TargetOutcome,
} from "../analysis/target/types.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { parseTargetInput } from "./input/common.ts";
import { registerTargetCandidates, type TargetWorkflowCandidate } from "./target-candidates.ts";
import type { TargetInput, TargetSymbolKind } from "./target-input.ts";
import {
  computeFileFingerprint,
  type TargetLookupResult,
  type TargetRegistrationInput,
  type TargetRegistrationOutput,
  type TargetStoreEntry,
} from "./target-store.ts";

export type { TargetInput } from "./target-input.ts";

/** Target workflow policy selected by the intent-level session entry. */
export interface TargetWorkflowPolicy {
  /** Whether a file-level selector is valid for this intent. */
  readonly fileLevelAllowed: boolean;
  /** Whether a strict name anchor is required. */
  readonly nameAnchorRequired: boolean;
  /** Maximum displayed disambiguation candidates. */
  readonly maxResults?: number;
}

/** Typed Target workflow outcome. */
export type TargetWorkflowOutcome =
  | { kind: "resolved"; entry: Readonly<TargetStoreEntry>; notes: readonly string[] }
  | {
      kind: "target-group";
      file: string;
      confidence: ResolvedTargetData["confidence"];
      discoveryProvenance: ResolvedTargetGroupData["discoveryProvenance"];
      targets: ReadonlyArray<Readonly<TargetStoreEntry>>;
      totalCount: number;
      omittedCount: number;
      unknownNestingCount: number;
    }
  | {
      kind: "disambiguation";
      candidates: ReadonlyArray<TargetWorkflowCandidate>;
      omittedCount: number;
    }
  | {
      kind: "kind-mismatch";
      requestedKind: TargetSymbolKind;
      candidates: ReadonlyArray<TargetWorkflowCandidate>;
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

/**
 * Resolve exactly one canonical selector into target facts or a typed failure.
 * New and refined targets are always LSP-first; handle lookup deliberately
 * bypasses readiness so existing handles can still serve structural consumers.
 */
export async function resolveTargetWorkflow(
  input: TargetInput,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
  control?: CodeRequestControl,
): Promise<TargetWorkflowOutcome> {
  const parsed = parseTargetInput(input, ["handle", "anchor", "symbol", "file"]);
  if (parsed.kind === "invalid-input") return parsed;
  const target = parsed.value;

  if ("handle" in target) {
    return resolveHandle(target.handle, policy, deps);
  }
  if ("anchor" in target) {
    return resolveAnchoredWorkflow(target.anchor, policy, deps, control);
  }
  if ("symbol" in target) {
    return resolveSymbolWorkflow(target.symbol, policy, deps, control);
  }
  if (!policy.fileLevelAllowed) {
    return {
      kind: "invalid-input",
      message: "This workflow requires a handle, anchored point, or symbol target.",
    };
  }
  return resolveFileOnlyWorkflow(target.file, policy.maxResults ?? 10, deps, control);
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
  control?: CodeRequestControl,
): Promise<TargetWorkflowOutcome> {
  const file = normalizePath(anchor.file, deps.cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${anchor.file}\`` };
  }

  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "file", file },
    control,
  );
  if (readiness.kind === "timeout") {
    return {
      kind: "unavailable",
      reason: "LSP readiness timed out. Retry shortly or inspect code_health.",
    };
  }
  if (readiness.kind === "unavailable") {
    return { kind: "unavailable", reason: readiness.reason };
  }

  const outcome = await resolveAnchoredSymbolTarget(
    file,
    anchor.line,
    anchor.character,
    withSemanticRequestControl(
      withStructuralRequestControl(deps.capability.getProvider(deps.cwd), control),
      control,
    ),
    control,
  );
  return toWorkflowOutcome(
    await refineTargetOutcomeIdentity(
      outcome,
      deps.cwd,
      withStructuralRequestControl(deps.capability.getStructuralProvider(deps.cwd), control) ??
        undefined,
      control,
    ),
    policy,
    deps,
  );
}

async function resolveSymbolWorkflow(
  symbol: { query: string; scope?: string; symbolKind?: TargetSymbolKind },
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
  control?: CodeRequestControl,
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

  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "workspace" },
    control,
  );
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: "LSP readiness timed out. Retry shortly." };
  }
  if (readiness.kind === "unavailable") {
    return { kind: "unavailable", reason: readiness.reason };
  }

  const provider = withSemanticRequestControl(
    deps.capability.getSemanticProvider(deps.cwd),
    control,
  );
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
    control,
  });
  return toWorkflowOutcome(
    await refineTargetOutcomeIdentity(
      outcome,
      deps.cwd,
      withStructuralRequestControl(deps.capability.getStructuralProvider(deps.cwd), control) ??
        undefined,
      control,
    ),
    policy,
    deps,
  );
}

async function resolveFileOnlyWorkflow(
  requestedFile: string,
  maxResults: number,
  deps: TargetWorkflowDeps,
  control?: CodeRequestControl,
): Promise<TargetWorkflowOutcome> {
  const validation = validateFileTargetDiscovery(requestedFile, deps.cwd);
  if (validation.kind === "invalid-input") return validation;
  const file = validation.file;

  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "file", file },
    control,
  );
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: "LSP readiness timed out. Retry shortly." };
  }
  if (readiness.kind === "unavailable") {
    return { kind: "unavailable", reason: readiness.reason };
  }

  const result = await resolveFileTargetGroup(
    file,
    deps.cwd,
    {
      semantic:
        withSemanticRequestControl(deps.capability.getSemanticProvider(deps.cwd), control) ??
        undefined,
      structural:
        withStructuralRequestControl(deps.capability.getStructuralProvider(deps.cwd), control) ??
        undefined,
    },
    control,
  );
  if (result.kind === "invalid-input") return result;
  if (result.kind === "unavailable") {
    return { kind: "unavailable", reason: result.message };
  }

  return registerTargetGroup(result.group, deps, maxResults);
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
    return registerTargetGroup(outcome.group, deps, policy.maxResults ?? 10);
  }

  const candidates = registerTargetCandidates(outcome.candidates, deps.registerTarget);
  return outcome.kind === "kind-mismatch"
    ? {
        kind: "kind-mismatch",
        requestedKind: outcome.requestedKind,
        candidates,
        omittedCount: outcome.omittedCount,
      }
    : {
        kind: "disambiguation",
        candidates,
        omittedCount: outcome.omittedCount,
      };
}

function registerTargetGroup(
  group: ResolvedTargetGroupData,
  deps: TargetWorkflowDeps,
  maxResults: number,
): TargetWorkflowOutcome {
  const totalCount = group.targets.length;
  const visibleTargets = group.targets.slice(0, Math.max(0, maxResults));
  const fingerprint = computeFileFingerprint(group.file);
  const fileFingerprint = fingerprint.kind === "ok" ? fingerprint.fingerprint : "unfingerprinted";
  const targets = visibleTargets.map((target) =>
    immutableEntry(registerFromTargetData(target, deps, fileFingerprint).entry),
  );
  return Object.freeze({
    kind: "target-group",
    file: group.file,
    confidence: group.confidence,
    discoveryProvenance: Object.freeze([...group.discoveryProvenance]),
    targets: Object.freeze(targets),
    totalCount,
    omittedCount: totalCount - targets.length,
    unknownNestingCount: group.unknownNestingCount,
  });
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
  fileFingerprint?: string,
): TargetRegistrationOutput {
  return deps.registerTarget({
    file: target.file,
    position: target.position,
    declarationPosition: {
      line: target.declarationAnchor.line - 1,
      character: target.declarationAnchor.character - 1,
    },
    declarationOccurrence: target.declarationOccurrence,
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    identityKind: target.identityKind ?? canonicalDeclarationKind(target.kind),
    confidence: target.confidence,
    provenance: target.provenance,
    anchorKind: target.anchorKind,
    container: target.container,
    resolution: target.resolution,
    fileFingerprint,
  });
}

function immutableEntry(entry: TargetStoreEntry): Readonly<TargetStoreEntry> {
  return Object.freeze({
    ...entry,
    position: Object.freeze({ ...entry.position }),
    provenance: Object.freeze([...entry.provenance]),
    declarationPosition: entry.declarationPosition
      ? Object.freeze({ ...entry.declarationPosition })
      : entry.declarationPosition,
    resolution: entry.resolution
      ? Object.freeze({
          ...entry.resolution,
          requested: Object.freeze({ ...entry.resolution.requested }),
          resolved: Object.freeze({ ...entry.resolution.resolved }),
        })
      : undefined,
  });
}
