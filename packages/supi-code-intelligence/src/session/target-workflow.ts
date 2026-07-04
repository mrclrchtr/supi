/**
 * Target workflow — session-owned deep module.
 *
 * Turns public target input (targetId, anchored coordinates, symbol
 * query, file reference) into an immutable **resolved target** before
 * graph, impact, orientation, or refactor analysis begins.
 *
 * One policy-driven method. Small interface, deep implementation.
 * Two adapters (production capability adapter + test adapter) justify
 * the seam.
 *
 * @mrclrchtr/supi-code-intelligence — internal, not exported via api.ts
 */

import { existsSync } from "node:fs";
import { normalizePath } from "../analysis/search/ripgrep.ts";
import { resolveAnchoredSymbolTarget } from "../analysis/target/anchored.ts";
import { resolveFileTargetGroup } from "../analysis/target/file.ts";
import { resolveSymbolTarget } from "../analysis/target/symbol.ts";
import type { ResolvedTargetData, TargetOutcome } from "../analysis/target/types.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import type {
  AnchorKind,
  TargetLookupResult,
  TargetRegistrationInput,
  TargetRegistrationOutput,
  TargetStoreEntry,
} from "./target-store.ts";

// ── Input ─────────────────────────────────────────────────────────────

/** Public target input shape — mirrors the union of code_* tool params. */
export interface TargetWorkflowInput {
  /** Resolved target handle from code_resolve. Wins over everything else. */
  targetId?: string;
  /** File path (absolute or workspace-relative). */
  file?: string;
  /** 1-based line for anchored resolution. */
  line?: number;
  /** 1-based UTF-16 column for anchored resolution. */
  character?: number;
  /** Symbol name for workspace symbol query resolution. */
  symbol?: string;
  /** Preferred symbol kind for disambiguation. */
  kind?: string;
  /** Only exported symbols. */
  exportedOnly?: boolean;
  /** Maximum candidates for disambiguation. */
  maxResults?: number;
}

// ── Policy ────────────────────────────────────────────────────────────

/**
 * Target workflow policy — what the caller allows or requires.
 *
 * Each tool passes the policy that matches its public contract.
 */
export interface TargetWorkflowPolicy {
  /**
   * Whether file-level targets (no line/character) are allowed.
   * Disallowed → file-only input returns `invalid-input`.
   */
  fileLevelAllowed: boolean;

  /**
   * Whether the resolved target must carry a name anchor.
   * Callee lookups and rename require this; references do not.
   */
  nameAnchorRequired: boolean;

  /**
   * Whether to wait for semantic (LSP) readiness before symbol-
   * query or anchored resolution. Set false for tool paths that
   * only need targetId expansion or file-level resolution.
   */
  waitForSemantic: boolean;
}

// ── Outcome ───────────────────────────────────────────────────────────

/** Typed outcome of the target workflow — no markdown, no mutated params. */
export type TargetWorkflowOutcome =
  | {
      kind: "resolved";
      /** The stored target entry with handles. */
      entry: TargetStoreEntry;
      /**
       * Display notes for the caller, e.g. "targetId took precedence
       * over scope" or "resolved via declaration anchor snap."
       */
      notes: string[];
    }
  | {
      kind: "disambiguation";
      candidates: Array<{
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
  | {
      kind: "invalid-input";
      message: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    }
  | {
      /** No target input was provided. Caller decides fallback. */
      kind: "no-target";
    };

// ── Dependencies ──────────────────────────────────────────────────────

export interface TargetWorkflowDeps {
  /** Workspace root. */
  cwd: string;
  /** Injected capability adapter (production or test). */
  capability: CapabilityAdapter;
  /** Session-scoped target store lookup. */
  lookupTargetId: (targetId: string) => TargetLookupResult;
  /** Session-scoped target registration. */
  registerTarget: (input: TargetRegistrationInput) => TargetRegistrationOutput;
}

// ── Entry point ───────────────────────────────────────────────────────

/**
 * Execute the target workflow: resolve target input into an immutable
 * resolved target (or a typed failure outcome).
 *
 * Order of precedence:
 * 1. targetId (store lookup + freshness check)
 * 2. anchored coordinates (file + line + character → provider-backed)
 * 3. symbol query (workspace symbol → provider-backed)
 * 4. file-only (when policy.fileLevelAllowed)
 */
export async function resolveTargetWorkflow(
  input: TargetWorkflowInput,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  // ── 1. targetId lookup ──────────────────────────────────────────────
  if (input.targetId) {
    const result = deps.lookupTargetId(input.targetId);
    if (result.kind === "unavailable") {
      return { kind: "invalid-input", message: result.reason };
    }
    const entry = result.entry;

    // Anchor policy: name-anchor-required tools must refuse declaration anchors
    if (policy.nameAnchorRequired && entry.anchorKind === "declaration") {
      return {
        kind: "invalid-input",
        message:
          "The target resolved to a declaration anchor, not a name anchor. " +
          "Re-resolve via `code_resolve` when the LSP has indexed the file, " +
          "or pass `file` + `line` + `character` anchored on the identifier directly.",
      };
    }

    const notes = inferTargetIdNotes(input);
    return { kind: "resolved", entry, notes };
  }

  // ── 2. Anchored coordinates ────────────────────────────────────────
  if (input.file && input.line != null && input.character != null) {
    return resolveAnchoredWorkflow(input, policy, deps);
  }

  // ── 3. Symbol query ────────────────────────────────────────────────
  if (input.symbol) {
    return resolveSymbolWorkflow(input, policy, deps);
  }

  // ── 4. File-only ───────────────────────────────────────────────────
  if (input.file) {
    if (!policy.fileLevelAllowed) {
      return {
        kind: "invalid-input",
        message:
          "File-level target resolution is not allowed for this tool. " +
          "Provide anchored coordinates (`file`, `line`, `character`) or a `symbol`.",
      };
    }
    return resolveFileOnlyWorkflow(input, deps);
  }

  // ── 5. Nothing provided ────────────────────────────────────────────
  return { kind: "no-target" };
}

// ── Sub-routines ──────────────────────────────────────────────────────

async function resolveAnchoredWorkflow(
  input: TargetWorkflowInput,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  // biome-ignore lint/style/noNonNullAssertion: file is guaranteed non-null by caller guard branch
  const file = normalizePath(input.file!, deps.cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${input.file}\`` };
  }

  // Readiness gate
  if (policy.waitForSemantic) {
    const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
      kind: "file",
      file,
    });
    if (readiness.kind === "timeout") {
      return {
        kind: "unavailable",
        reason: "LSP readiness timed out. Retry shortly or check `code_health`.",
      };
    }
    if (readiness.kind === "unavailable") {
      return { kind: "unavailable", reason: readiness.reason };
    }
  }

  const provider = deps.capability.getProvider(deps.cwd);
  // biome-ignore lint/style/noNonNullAssertion: line/character non-null by caller guard
  const outcome = await resolveAnchoredSymbolTarget(file, input.line!, input.character!, provider);

  return toWorkflowOutcome(outcome, policy, deps);
}

async function resolveSymbolWorkflow(
  input: TargetWorkflowInput,
  policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  const semantic = deps.capability.getSemanticProvider(deps.cwd);
  if (!semantic) {
    // Try to wait
    if (policy.waitForSemantic) {
      const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
        kind: "workspace",
      });
      if (readiness.kind !== "ready") {
        return {
          kind: "unavailable",
          reason:
            "Symbol query requires an active LSP. Enable LSP and retry, or use anchored coordinates.",
        };
      }
    } else {
      return {
        kind: "unavailable",
        reason:
          "Symbol query requires an active LSP. Enable LSP and retry, or use anchored coordinates.",
      };
    }
  }

  // Re-read provider after potential wait
  const provider = deps.capability.getSemanticProvider(deps.cwd);
  if (!provider) {
    return {
      kind: "unavailable",
      reason: "Symbol query requires an active LSP. Enable LSP and retry.",
    };
  }
  // biome-ignore lint/style/noNonNullAssertion: symbol non-null by caller guard
  const outcome = await resolveSymbolTarget(input.symbol!, deps.cwd, provider, {
    kind: input.kind,
    exportedOnly: input.exportedOnly,
    maxResults: input.maxResults,
  });

  return toWorkflowOutcome(outcome, policy, deps);
}

async function resolveFileOnlyWorkflow(
  input: TargetWorkflowInput,
  deps: TargetWorkflowDeps,
): Promise<TargetWorkflowOutcome> {
  // biome-ignore lint/style/noNonNullAssertion: file non-null by caller guard
  const file = normalizePath(input.file!, deps.cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${input.file}\`` };
  }

  const result = await resolveFileTargetGroup(file, deps.cwd, {
    semantic: deps.capability.getSemanticProvider(deps.cwd) ?? undefined,
    structural: deps.capability.getStructuralProvider(deps.cwd) ?? undefined,
  });
  if (result.kind === "error") {
    return { kind: "invalid-input", message: result.message };
  }

  // Register the file-level target
  const group = result.group;
  const entry = deps.registerTarget({
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

  return { kind: "resolved", entry: entry.entry, notes: [] };
}

// ── Outcome conversion ────────────────────────────────────────────────

/**
 * Convert a raw {@link TargetOutcome} from analysis/target/* into a
 * {@link TargetWorkflowOutcome} with registered handles.
 */
function toWorkflowOutcome(
  outcome: TargetOutcome,
  _policy: TargetWorkflowPolicy,
  deps: TargetWorkflowDeps,
): TargetWorkflowOutcome {
  if (outcome.kind === "error") {
    return { kind: "invalid-input", message: outcome.message };
  }

  if (outcome.kind === "resolved") {
    const entry = registerFromTargetData(outcome.target, deps);
    return {
      kind: "resolved",
      entry: entry.entry,
      notes: buildResolutionNotes(outcome.target),
    };
  }

  if (outcome.kind === "disambiguation") {
    const candidates = outcome.candidates.map((c, idx) => {
      const registered = deps.registerTarget({
        file: c.file,
        position: { line: c.line - 1, character: c.character - 1 },
        displayLine: c.line,
        displayCharacter: c.character,
        name: c.name,
        kind: c.kind,
        confidence: "semantic",
        provenance: "symbol-query",
        anchorKind: c.anchorKind ?? "declaration",
        container: c.container,
      });
      return {
        targetId: registered.targetId,
        name: c.name,
        kind: c.kind,
        container: c.container,
        file: c.file,
        line: c.line,
        character: c.character,
        rank: idx + 1,
        anchorKind: c.anchorKind ?? "declaration",
      };
    });
    return { kind: "disambiguation", candidates, omittedCount: outcome.omittedCount };
  }

  // Unknown outcome kind — shouldn't happen with current resolvers
  return { kind: "invalid-input", message: "Unexpected resolution outcome." };
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Build notes for targetId precedence over other inputs. */
function inferTargetIdNotes(input: TargetWorkflowInput): string[] {
  const notes: string[] = [];
  if (input.file || input.line != null || input.character != null) {
    notes.push(
      "_Note: `targetId` takes precedence over the supplied file/coordinates; " +
        "file, line, and character were ignored._",
    );
  }
  if (input.symbol) {
    notes.push("_Note: `targetId` takes precedence over the supplied `symbol` parameter._");
  }
  return notes;
}

/** Build display notes for resolved anchored targets. */
function buildResolutionNotes(target: ResolvedTargetData): string[] {
  const notes: string[] = [];
  if (target.resolution?.snapped) {
    const src = target.resolution.source;
    notes.push(
      `_Note: Resolved from a declaration header snap (${src}); the anchor was moved to the identifier._`,
    );
  }
  if (target.resolution?.source === "structural-identifier") {
    notes.push(
      "_Note: Resolved via tree-sitter structural evidence; semantic (LSP) symbols were unavailable._",
    );
  }
  return notes;
}

/** Register a ResolvedTargetData and return the store entry. */
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
