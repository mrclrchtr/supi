/**
 * Precise-target resolution and execution for code_orientation.
 *
 * Handles targetId expansion, coordinate-based symbol resolution, and
 * running the use-case layer for a resolved symbol target. Shared by
 * the main code_orientation executor.
 *
 * Uses the session target workflow (deep seam) instead of ad-hoc
 * expandTargetId / executeResolveService calls.
 */

import { relative } from "node:path";
import type { TargetWorkflowOutcome } from "../../session/session.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx, ContextDetails } from "../../types/index.ts";
import { orientationCoordinateRules } from "../infra/cross-field.ts";
import { unavailableContextDetails } from "../infra/error-results.ts";
import { prepareOrientationDeps } from "./deps.ts";
import type { CodeOrientationToolParams } from "./execute.ts";
import { executeOrientation } from "./orchestrate.ts";

/**
 * A resolved precise target: the store entry (with handles) plus
 * contextual notes (e.g. "targetId took precedence over focus").
 */
export interface PreciseTarget {
  entry: TargetStoreEntry;
  notes: string[];
}

/**
 * Outcome of precise-target resolution in code_orientation.
 */
export type PreciseTargetOutcome =
  | { kind: "resolved"; result: CodeIntelResult }
  | { kind: "fallthrough" };

/** Orientation target-workflow policy: file-level not for precise, name anchor not required. */
const ORIENTATION_TARGET_POLICY = {
  fileLevelAllowed: false,
  nameAnchorRequired: false,
  waitForSemantic: true,
} as const;

/**
 * Resolve a precise target ({@link CodeOrientationToolParams.targetId}
 * wins over focus/coordinates), then run symbol-centered orientation
 * sections. Falls through to orientation-mode when both targetId
 * expansion and coordinate resolution produce no target.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: layered resolution + disambiguation + section building stays together for clarity
export async function resolvePreciseTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<PreciseTargetOutcome> {
  // ── Deep seam: resolve through session target workflow ──
  if (params.targetId !== undefined && params.targetId !== null) {
    const outcome = await ctx.session.resolveTarget(
      {
        targetId: params.targetId,
        file: hasCoords ? params.focus : undefined,
        line: hasCoords ? params.line : undefined,
        character: hasCoords ? params.character : undefined,
      },
      ORIENTATION_TARGET_POLICY,
    );
    if (outcome.kind === "resolved") {
      const precise: PreciseTarget = {
        entry: outcome.entry,
        notes: outcome.notes,
      };
      return wrapOutcome(await runWithOrientationTarget(params, ctx, precise));
    }
    if (outcome.kind === "invalid-input" || outcome.kind === "unavailable") {
      return wrapOutcome({
        content: `**Error:** ${outcome.kind === "invalid-input" ? outcome.message : outcome.reason}`,
        details: unavailableContextDetails([
          "Verify the `targetId` is valid and from this session",
          "Re-resolve with `code_resolve` to get a fresh targetId",
        ]),
      });
    }
  }

  if (hasCoords) {
    const coordOutcome = await resolveCoordinateTarget(params, ctx);
    if (coordOutcome.kind === "resolved") return coordOutcome;
  }

  return { kind: "fallthrough" };
}

/** Resolve a focus+coordinate-supplied precise target, or fallthrough. */
async function resolveCoordinateTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<PreciseTargetOutcome> {
  const coordError = validateCoordinateParams(params, ctx.cwd);
  if (coordError) {
    return wrapOutcome({
      content: coordError,
      details: unavailableContextDetails([
        "Provide `focus`, `line`, and `character` together for symbol orientation",
      ]),
    });
  }

  const outcome = await ctx.session.resolveTarget(
    { file: params.focus, line: params.line, character: params.character },
    ORIENTATION_TARGET_POLICY,
  );

  if (outcome.kind === "resolved") {
    return wrapOutcome(
      await runWithOrientationTarget(params, ctx, { entry: outcome.entry, notes: outcome.notes }),
    );
  }

  if (outcome.kind === "disambiguation") {
    return wrapOutcome(disambiguationResult(outcome));
  }

  if (outcome.kind === "invalid-input") {
    return wrapOutcome({
      content: outcome.message,
      details: unavailableContextDetails([
        "Use `code_inspect` for point-level facts at this coordinate",
        "Or pass the identifier coordinate of a declaration",
      ]),
    });
  }

  return wrapOutcome({
    content: "**Error:** Coordinate resolution returned no target.",
    details: unavailableContextDetails(["Use `code_inspect` for point-level facts"]),
  });
}

/** Wrap a CodeIntelResult into a resolved PreciseTargetOutcome. */
function wrapOutcome(result: CodeIntelResult): PreciseTargetOutcome {
  return { kind: "resolved", result };
}

async function runWithOrientationTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  precise: PreciseTarget,
): Promise<CodeIntelResult> {
  const entry = precise.entry;
  params.file = entry.file;
  params.line = entry.displayLine;
  params.character = entry.displayCharacter;
  params.targetName = entry.name;
  params.targetKind = entry.kind;
  params.targetAnchorKind = entry.anchorKind;

  const deps = await prepareOrientationDeps(params, ctx);
  if ("content" in deps) return deps;

  const result = await executeOrientation(
    {
      target: buildOrientationTarget(params),
      maxResults: params.maxResults ?? 10,
      showGitContext: false,
    },
    { ...deps, cwd: ctx.cwd },
  );

  const content = prependNotes(result.content, precise.notes, entry, ctx.cwd);
  const details: ContextDetails = { ...result.details, target: entry };
  return { content, details: { type: "context", data: details } };
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Cross-field rule for code_orientation coordinate mode. */
const validateCoordinateParams = orientationCoordinateRules<CodeOrientationToolParams>();

function buildOrientationTarget(params: CodeOrientationToolParams) {
  if (!params.file || params.line == null || params.character == null) return null;
  return {
    file: params.file,
    line: params.line,
    character: params.character,
    name: params.targetName ?? null,
    kind: params.targetKind ?? null,
    anchorKind: params.targetAnchorKind ?? "name",
  };
}

/** Prepend notes + a resolved-target summary to rendered orientation content. */
function prependNotes(
  content: string,
  notes: string[],
  entry: TargetStoreEntry,
  cwd: string,
): string {
  const head: string[] = [];
  if (notes.length > 0) {
    head.push(notes.join("\n\n"));
    head.push("");
  }
  const namePart = entry.name ? ` **${entry.name}**` : "";
  const relFile = relative(cwd, entry.file) || entry.file;
  head.push(
    `Resolved target${namePart}: \`${relFile}\`:${entry.displayLine}:${entry.displayCharacter} — Target ID: \`${entry.targetId}\``,
  );
  head.push("");
  return `${head.join("\n")}${content}`;
}

// ── Disambiguation ────────────────────────────────────────────────────

/** Build the ambiguous-coordinate result: candidate targetIds, no sections. */
function disambiguationResult(
  outcome: Extract<TargetWorkflowOutcome, { kind: "disambiguation" }>,
): CodeIntelResult {
  const lines: string[] = ["# Multiple matches found", ""];
  lines.push(
    "Coordinate resolution was ambiguous. Use `focus` + `line` + `character` for one of the candidates (pass the identifier coordinate):",
  );
  lines.push("");
  for (const c of outcome.candidates) {
    const kind = c.kind ? ` (\`${c.kind}\`)` : "";
    const container = c.container ? ` in \`${c.container}\`` : "";
    lines.push(
      `${c.rank}. **${c.name}**${kind}${container} — \`${c.file}\`:${c.line}:${c.character}`,
    );
    lines.push(`   Target ID: \`${c.targetId}\``);
  }

  const details: ContextDetails = {
    confidence: "semantic",
    task: null,
    focusTarget: null,
    requestedSections: [],
    renderedSections: [],
    omittedCount: outcome.omittedCount,
    candidates: outcome.candidates.map((c) => ({
      targetId: c.targetId,
      name: c.name,
      kind: c.kind,
      container: c.container,
      file: c.file,
      line: c.line,
      character: c.character,
      rank: c.rank,
    })),
    nextQueries: [
      "Use `focus` + `line` + `character` for one of the candidates above (pass the identifier coordinate)",
    ],
  };

  return { content: lines.join("\n"), details: { type: "context", data: details } };
}
