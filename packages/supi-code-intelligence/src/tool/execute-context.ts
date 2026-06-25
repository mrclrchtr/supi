// biome-ignore-all lint/style/noExcessiveLinesPerFile: target-precedence orchestration (targetId/coordinate/orientation modes) stays together to share local target/note/deps helpers
import { relative, resolve } from "node:path";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import { executeResolveService } from "../analysis/resolve/service.ts";
import { buildArchitectureModel } from "../model.ts";
import { resolveScope } from "../search-helpers.ts";
import type {
  CodeIntelResult,
  CodeIntelToolExecCtx,
  ConfidenceMode,
  ContextDetails,
  ResolvedTargetMetadata,
} from "../types.ts";
import { executeContext } from "../use-case/generate-context.ts";
import type { ContextDeps as UseCaseContextDeps } from "../use-case/types.ts";
import { unavailableContextDetails } from "./details-helpers.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
import { expandTargetId } from "./target-id-params.ts";

export interface CodeContextToolParams {
  task?: string;
  targetId?: string;
  scope?: string;
  budget?: "small" | "medium" | "large";
  include?: Array<
    "defs" | "references" | "callees" | "tests" | "docs" | "diagnostics" | "exports" | "imports"
  >;
  maxResults?: number;
  // Public coordinate target mode fields (file + line + character). When
  // present, the tool resolves a real symbol target through the same path as
  // `code_resolve` and exposes a reusable `targetId`.
  file?: string;
  line?: number;
  character?: number;
  // Internal-only expansion fields populated from targetId.
  targetName?: string | null;
  targetKind?: string | null;
  targetAnchorKind?: "name" | "declaration";
}

/** Track which cwds have already shown git context in this session. */
const shownGitContextCwds = new Set<string>();

/** A resolved precise target plus the notes to surface in markdown/details. */
interface PreciseTarget {
  file: string;
  line: number;
  character: number;
  name: string | null;
  kind: string | null;
  anchorKind: "name" | "declaration";
  targetId: string;
  spanId: string;
  /** Provenance confidence plumbed from the resolved entry (semantic/structural/...). */
  confidence: ConfidenceMode;
  resolution?: import("../types.ts").AnchoredResolutionMetadata;
  /** Markdown note lines to prepend (e.g. "coordinates ignored", "scope ignored"). */
  notes: string[];
}

/** Execute the public code_context tool through the planner-backed use-case layers. */
export async function executeContextTool(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const hasCoords =
    params.file !== undefined || params.line !== undefined || params.character !== undefined;
  const hasPreciseTarget = (params.targetId !== undefined && params.targetId !== null) || hasCoords;

  // `scope` is a selection/orientation boundary, not a downstream evidence
  // filter. A precise target (`targetId` or coordinates) wins outright: scope
  // is ignored entirely — including an invalid scope path — and surfaced with
  // a visible note in the precise-target result. Validate `scope` only for the
  // orientation/selection path that actually uses it.
  if (hasPreciseTarget) {
    return resolvePreciseTarget(params, ctx, hasCoords);
  }
  return runOrientationMode(params, ctx);
}

/** Resolve a precise target (targetId wins over coordinates), ignoring `scope`. */
async function resolvePreciseTarget(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<CodeIntelResult> {
  // targetId wins over coordinates. A stale/invalid targetId errors and does
  // NOT fall back to coordinates.
  if (params.targetId !== undefined && params.targetId !== null) {
    const targetIdResult = await resolveTargetIdTarget(params, ctx, hasCoords);
    if (targetIdResult) return targetIdResult;
  }

  // Coordinate mode: resolve a real symbol target through the same path as
  // `code_resolve`. Requires all three coordinate fields when any is present.
  if (hasCoords) {
    const coordResult = await resolveCoordinateTarget(params, ctx);
    if (coordResult) return coordResult;
  }
  // Unreachable when called via `executeContextTool` (hasPreciseTarget guards
  // this path), but kept defensive so the helper stays self-consistent.
  return runOrientationMode(params, ctx);
}

/** Orientation / scope-only mode: validate `scope` (the selection input) and run. */
async function runOrientationMode(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  // `scope` is the actual selection input in orientation mode, so an invalid
  // path is a hard error here (unlike precise-target mode, where it is
  // ignored). Resolve once and pass down so downstream does not re-resolve.
  const scopeResolution = resolveScope(params.scope, ctx.cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableContextDetails([
        "Verify the `scope` path exists and is within the workspace",
      ]),
    };
  }
  // Preserve the downstream "no scope" sentinel: `undefined` when no scope
  // was supplied, the resolved absolute path otherwise. `resolveScope` returns
  // `cwd` for an absent scope, which would change downstream filtering
  // semantics if passed through verbatim.
  const resolvedScope = params.scope ? scopeResolution.path : undefined;
  return runOrientation(params, ctx, resolvedScope);
}

/** Resolve a targetId-supplied precise target, or null to fall through. */
async function resolveTargetIdTarget(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<CodeIntelResult | null> {
  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
      details: unavailableContextDetails([
        "Verify the `targetId` is valid and from this session",
        "Re-resolve with `code_resolve` to get a fresh targetId",
      ]),
    };
  }
  if (expansion.kind !== "ok") return null;

  const notes: string[] = [];
  if (hasCoords) {
    notes.push(
      "_Note: `targetId` takes precedence over the supplied coordinates; the coordinates were ignored._",
    );
  }
  const scopeNote = scopeIgnoredNote(params.scope);
  if (scopeNote) notes.push(scopeNote);
  const precise: PreciseTarget = {
    file: expansion.file,
    line: expansion.line,
    character: expansion.character,
    name: expansion.targetName,
    kind: expansion.targetKind,
    anchorKind: expansion.entry.anchorKind,
    targetId: expansion.entry.targetId,
    spanId: expansion.entry.spanId,
    confidence: expansion.entry.confidence,
    notes,
  };
  return runWithContextTarget(params, ctx, precise);
}

/** Resolve a coordinate-supplied precise target, or null to fall through. */
async function resolveCoordinateTarget(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult | null> {
  const coordError = validateCoordinateParams(params);
  if (coordError) {
    return {
      content: coordError,
      details: unavailableContextDetails([
        "Provide all of `file`, `line`, and `character` for coordinate target mode",
      ]),
    };
  }

  const resolveResult = await executeResolveService(
    { file: params.file, line: params.line, character: params.character },
    ctx.cwd,
  );

  if (resolveResult.kind === "error") {
    return {
      content: resolveResult.message,
      details: unavailableContextDetails([
        "Use `code_inspect` for point-level facts at this coordinate",
        "Or pass the identifier coordinate of a declaration",
      ]),
    };
  }
  if (resolveResult.kind === "disambiguation") {
    return disambiguationResult(resolveResult);
  }

  const entry = resolveResult.targets[0];
  if (!entry) {
    return {
      content: "**Error:** Coordinate resolution returned no target.",
      details: unavailableContextDetails(["Use `code_inspect` for point-level facts"]),
    };
  }
  const scopeNote = scopeIgnoredNote(params.scope);
  const precise: PreciseTarget = {
    file: resolveAbsFile(ctx.cwd, entry.file),
    line: entry.displayLine,
    character: entry.displayCharacter,
    name: entry.name,
    kind: entry.kind,
    anchorKind: entry.anchorKind,
    targetId: entry.targetId,
    spanId: entry.spanId,
    confidence: entry.confidence,
    resolution: entry.resolution,
    notes: scopeNote ? [scopeNote] : [],
  };
  return runWithContextTarget(params, ctx, precise);
}

/** Run context sections for a precise target, merging target metadata + notes. */
async function runWithContextTarget(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
  precise: PreciseTarget,
): Promise<CodeIntelResult> {
  // `scope` is validated once at the top of `executeContextTool` and ignored
  // for a precise target (it is a selection boundary, not an evidence filter).
  // The scope-ignored note is already carried in `precise.notes`.

  // Populate the internal expansion fields so the use-case receives a target.
  params.file = precise.file;
  params.line = precise.line;
  params.character = precise.character;
  params.targetName = precise.name;
  params.targetKind = precise.kind;
  params.targetAnchorKind = precise.anchorKind;

  const deps = await prepareContextDeps(params, ctx);
  if ("content" in deps) return deps;

  // When `task` is present and `include` is omitted, default to the most
  // useful sections for a coding task.
  const include =
    params.include ?? (params.task ? ["defs", "references", "tests", "diagnostics"] : undefined);

  // Task mode with a target — git context is for orientation only.
  const result = await executeContext(
    {
      task: params.task,
      target: buildContextTarget(params),
      scope: undefined, // precise target — scope is ignored
      budget: params.budget,
      include,
      maxResults: params.maxResults,
      showGitContext: false,
    },
    { ...deps, cwd: ctx.cwd },
  );

  const targetMeta = buildTargetMetadata(precise, ctx.cwd);
  const details: ContextDetails = { ...result.details, target: targetMeta };
  const content = prependNotes(result.content, precise.notes, targetMeta);
  return { content, details: { type: "context", data: details } };
}

/** Orientation / scope-only mode (no precise target). */
async function runOrientation(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
  resolvedScope: string | undefined,
): Promise<CodeIntelResult> {
  // `scope` is validated and resolved once at the top of `executeContextTool`;
  // `resolvedScope` is `undefined` when no scope was supplied (preserving the
  // downstream "no scope filtering" sentinel) and the absolute path otherwise.

  const deps = await prepareContextDeps(params, ctx);
  if ("content" in deps) return deps;

  // This branch is only reached without a precise target — targetId and
  // coordinate modes are handled upstream in `executeContextTool` and never
  // fall through here. So every call is an orientation call: show git context
  // once per cwd (task-with-target git suppression lives in
  // `runWithContextTarget`).
  const showGitContext = !shownGitContextCwds.has(ctx.cwd);
  shownGitContextCwds.add(ctx.cwd);

  // When `task` is present and `include` is omitted, default to the most
  // useful sections for a coding task.
  const include =
    params.include ?? (params.task ? ["defs", "references", "tests", "diagnostics"] : undefined);

  const result = await executeContext(
    {
      task: params.task,
      target: buildContextTarget(params),
      scope: resolvedScope,
      budget: params.budget,
      include,
      maxResults: params.maxResults,
      showGitContext,
    },
    { ...deps, cwd: ctx.cwd },
  );

  return {
    content: result.content,
    details: { type: "context", data: result.details },
  };
}

/** Shared context dependencies (provider/model/lsp) or a readiness error result. */
type ContextDeps = Omit<UseCaseContextDeps, "cwd"> | CodeIntelResult;

async function prepareContextDeps(
  params: CodeContextToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<ContextDeps> {
  const readinessResult = await gateSemanticReadiness(params, ctx.cwd);
  if (readinessResult) return readinessResult;

  const providerState = getCodeProvider(ctx.cwd);
  const provider: CodeProvider | null =
    providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };
  const model = await buildArchitectureModel(ctx.cwd);
  return { model, provider, lspService };
}

/** Build the ambiguous-coordinate result: candidate targetIds, no sections. */
function disambiguationResult(
  result: Extract<Awaited<ReturnType<typeof executeResolveService>>, { kind: "disambiguation" }>,
): CodeIntelResult {
  const lines: string[] = ["# Multiple matches found", ""];
  lines.push(
    "Coordinate resolution was ambiguous. Use `file` + `line` + `character` for one of the candidates (pass the identifier coordinate):",
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
      "Use `file` + `line` + `character` for one of the candidates above (pass the identifier coordinate)",
    ],
  };

  return { content: lines.join("\n"), details: { type: "context", data: details } };
}

function buildContextTarget(params: CodeContextToolParams) {
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

/** Validate that all three coordinate fields are present when any is. */
function validateCoordinateParams(params: CodeContextToolParams): string | null {
  const hasFile = params.file !== undefined && params.file.length > 0;
  const hasLine = params.line !== undefined;
  const hasChar = params.character !== undefined;
  if (!hasFile || !hasLine || !hasChar) {
    return "**Error:** Coordinate target mode requires all of `file`, `line`, and `character` together.";
  }
  return null;
}

/** A `scope`-ignored note, or null when no scope was supplied. */
function scopeIgnoredNote(scope: string | undefined): string | null {
  if (!scope) return null;
  return "_Note: `scope` is ignored for a precise target — it is a selection boundary, not a downstream evidence filter. Use the resolved target directly._";
}

/** Build the structured resolved-target metadata for `details.data.target`. */
function buildTargetMetadata(precise: PreciseTarget, cwd: string): ResolvedTargetMetadata {
  return {
    targetId: precise.targetId,
    spanId: precise.spanId,
    file: relative(cwd, precise.file) || precise.file,
    displayLine: precise.line,
    displayCharacter: precise.character,
    name: precise.name,
    kind: precise.kind,
    anchorKind: precise.anchorKind,
    confidence: precise.confidence,
    resolution: precise.resolution,
  };
}

/** Prepend notes + a resolved-target summary to the rendered context content. */
function prependNotes(content: string, notes: string[], target: ResolvedTargetMetadata): string {
  const head: string[] = [];
  if (notes.length > 0) {
    head.push(notes.join("\n\n"));
    head.push("");
  }
  const namePart = target.name ? ` **${target.name}**` : "";
  // Plain (non-italic) line with balanced code spans. Wrapping a line that
  // contains code spans in a single `_…_` italic is fragile in CommonMark
  // (underscore close-flanking fails after a backtick) and the previous form
  // also emitted an odd backtick count, leaving an unclosed code span.
  head.push(
    `Resolved target${namePart}: \`${target.file}\`:${target.displayLine}:${target.displayCharacter} — Target ID: \`${target.targetId}\``,
  );
  head.push("");
  return `${head.join("\n")}${content}`;
}

/** Resolve a workspace-relative file to absolute (for the use-case target). */
function resolveAbsFile(cwd: string, relFile: string): string {
  // `path.resolve` returns `relFile` as-is when it is already absolute and
  // otherwise resolves it from `cwd` — matching the prior hand-rolled behavior
  // while being Windows-safe and consistent with the rest of the codebase.
  return resolve(cwd, relFile);
}

async function gateSemanticReadiness(
  params: CodeContextToolParams,
  cwd: string,
): Promise<CodeIntelResult | null> {
  // Orientation-only and structural-only calls skip the LSP readiness gate.
  const semanticSections = new Set(["references", "implements", "diagnostics", "defs"]);
  const hasSemanticTarget = params.file != null && params.line != null && params.character != null;
  const hasSemanticInclude =
    params.include?.some((section) => semanticSections.has(section)) ?? false;
  if (!hasSemanticTarget && !hasSemanticInclude) return null;

  const readiness = await ensureSemanticReadiness(
    cwd,
    params.file ? { kind: "file", file: params.file } : { kind: "workspace" },
  );
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_context", 15_000),
      details: unavailableContextDetails(["Retry shortly or check `code_health`"]),
    };
  }
  // Let unavailable pass through — downstream section renderers handle
  // unavailable LSP with honest notes rather than blocking the whole call.
  return null;
}
