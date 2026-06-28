/**
 * Precise-target resolution and execution for code_orientation.
 *
 * Handles targetId expansion, coordinate-based symbol resolution, and
 * running the use-case layer for a resolved symbol target. Shared by
 * the main code_orientation executor.
 */

import { relative } from "node:path";
import { executeResolveService } from "../../analysis/target/service.ts";
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
 *
 * {@link resolvePreciseTarget} returns this discriminated union instead
 * of {@link CodeIntelResult} | null so callers can't silently fall through
 * on a bug that produces null unintentionally.
 */
export type PreciseTargetOutcome =
  | { kind: "resolved"; result: CodeIntelResult }
  | { kind: "fallthrough" };

/**
 * Resolve a precise target ({@link CodeOrientationToolParams.targetId}
 * wins over focus/coordinates), then run symbol-centered orientation
 * sections. Falls through to orientation-mode when both targetId
 * expansion and coordinate resolution produce no target.
 */
export async function resolvePreciseTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<PreciseTargetOutcome> {
  if (params.targetId !== undefined && params.targetId !== null) {
    const targetIdOutcome = await resolveTargetIdTarget(params, ctx, hasCoords);
    if (targetIdOutcome.kind === "resolved") return targetIdOutcome;
  }

  if (hasCoords) {
    const coordOutcome = await resolveCoordinateTarget(params, ctx);
    if (coordOutcome.kind === "resolved") return coordOutcome;
  }

  return { kind: "fallthrough" };
}

/** Resolve a targetId-supplied precise target, or fallthrough. */
async function resolveTargetIdTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<PreciseTargetOutcome> {
  const expansion = ctx.session.expandTargetId(params);
  if (expansion.kind === "error") {
    return wrapOutcome({
      content: expansion.message,
      details: unavailableContextDetails([
        "Verify the `targetId` is valid and from this session",
        "Re-resolve with `code_resolve` to get a fresh targetId",
      ]),
    });
  }
  if (expansion.kind !== "ok") return { kind: "fallthrough" };

  const notes: string[] = [];
  if (params.focus || hasCoords) {
    notes.push(
      "_Note: `targetId` takes precedence over the supplied focus/coordinates; focus and coordinates were ignored._",
    );
  }

  return wrapOutcome(
    await runWithOrientationTarget(params, ctx, { entry: expansion.entry, notes }),
  );
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

  const resolveResult = await executeResolveService(
    { file: params.focus, line: params.line, character: params.character },
    ctx.session,
  );

  if (resolveResult.kind === "error") {
    return wrapOutcome({
      content: resolveResult.message,
      details: unavailableContextDetails([
        "Use `code_inspect` for point-level facts at this coordinate",
        "Or pass the identifier coordinate of a declaration",
      ]),
    });
  }
  if (resolveResult.kind === "disambiguation") {
    return wrapOutcome(disambiguationResult(resolveResult));
  }

  const entry = resolveResult.targets[0];
  if (!entry) {
    return wrapOutcome({
      content: "**Error:** Coordinate resolution returned no target.",
      details: unavailableContextDetails(["Use `code_inspect` for point-level facts"]),
    });
  }

  return wrapOutcome(await runWithOrientationTarget(params, ctx, { entry, notes: [] }));
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

/**
 * Cross-field rule for code_orientation coordinate mode.
 *
 * TypeBox already enforces line/character types and min >= 1.
 * This covers only pairing, existence, and directory checks.
 */
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
  result: Extract<Awaited<ReturnType<typeof executeResolveService>>, { kind: "disambiguation" }>,
): CodeIntelResult {
  const lines: string[] = ["# Multiple matches found", ""];
  lines.push(
    "Coordinate resolution was ambiguous. Use `focus` + `line` + `character` for one of the candidates (pass the identifier coordinate):",
  );
  lines.push("");
  for (const c of result.candidates) {
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
    omittedCount: 0,
    candidates: result.candidates.map((c) => ({
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
