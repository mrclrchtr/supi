// biome-ignore-all lint/style/noExcessiveLinesPerFile: orientation target-precedence orchestration stays together to share target/note/dependency helpers
import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import { executeResolveService } from "../analysis/resolve/service.ts";
import { type ArchitectureModel, buildArchitectureModel } from "../model.ts";
import { normalizePath } from "../search-helpers.ts";
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

export interface CodeOrientationToolParams {
  /** Workspace-relative path or discovered module name for orientation. */
  focus?: string;
  /** Resolved target handle from code_resolve. Wins over focus/coordinates. */
  targetId?: string;
  /** 1-based line for symbol orientation. Requires focus. */
  line?: number;
  /** 1-based UTF-16 column for symbol orientation. Requires focus and line. */
  character?: number;
  /** Maximum results per rendered list. Defaults to 10. */
  maxResults?: number;
  // Internal-only expansion fields populated from targetId or coordinate resolution.
  file?: string;
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
  confidence: ConfidenceMode;
  resolution?: import("../types.ts").AnchoredResolutionMetadata;
  notes: string[];
}

/** Execute the public code_orientation tool through the planner-backed use-case layers. */
export async function executeOrientationTool(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const hasCoords = params.line !== undefined || params.character !== undefined;
  const hasTargetId = params.targetId !== undefined && params.targetId !== null;

  if (hasTargetId || hasCoords) {
    return resolvePreciseTarget(params, ctx, hasCoords);
  }
  return runOrientationMode(params, ctx);
}

/** Resolve a precise target (targetId wins over focus/coordinates). */
async function resolvePreciseTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<CodeIntelResult> {
  if (params.targetId !== undefined && params.targetId !== null) {
    const targetIdResult = await resolveTargetIdTarget(params, ctx, hasCoords);
    if (targetIdResult) return targetIdResult;
  }

  if (hasCoords) {
    const coordResult = await resolveCoordinateTarget(params, ctx);
    if (coordResult) return coordResult;
  }

  return runOrientationMode(params, ctx);
}

/** Orientation mode: validate/resolve focus and run a project/module/directory/file brief. */
async function runOrientationMode(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const deps = await prepareContextDeps(params, ctx);
  if ("content" in deps) return deps;

  const focusResolution = resolveOrientationFocus(params.focus, ctx.cwd, deps.model);
  if (focusResolution.kind === "error") {
    return {
      content: `**Error:** ${focusResolution.reason}`,
      details: unavailableContextDetails([
        "Provide a workspace-relative path or a discovered module name as `focus`",
      ]),
    };
  }

  const showGitContext = !shownGitContextCwds.has(ctx.cwd);
  shownGitContextCwds.add(ctx.cwd);

  const result = await executeContext(
    {
      focus: focusResolution.path,
      maxResults: params.maxResults ?? 10,
      showGitContext,
    },
    { ...deps, cwd: ctx.cwd },
  );

  return { content: result.content, details: { type: "context", data: result.details } };
}

/** Resolve a targetId-supplied precise target, or null to fall through. */
async function resolveTargetIdTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  hasCoords: boolean,
): Promise<CodeIntelResult | null> {
  const expansion = ctx.session.expandTargetId(params);
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
  if (params.focus || hasCoords) {
    notes.push(
      "_Note: `targetId` takes precedence over the supplied focus/coordinates; focus and coordinates were ignored._",
    );
  }

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

/** Resolve a focus+coordinate-supplied precise target, or null to fall through. */
async function resolveCoordinateTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult | null> {
  const coordError = validateCoordinateParams(params, ctx.cwd);
  if (coordError) {
    return {
      content: coordError,
      details: unavailableContextDetails([
        "Provide `focus`, `line`, and `character` together for symbol orientation",
      ]),
    };
  }

  const resolveResult = await executeResolveService(
    { file: params.focus, line: params.line, character: params.character },
    ctx.session,
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
  if (resolveResult.kind === "disambiguation") return disambiguationResult(resolveResult);

  const entry = resolveResult.targets[0];
  if (!entry) {
    return {
      content: "**Error:** Coordinate resolution returned no target.",
      details: unavailableContextDetails(["Use `code_inspect` for point-level facts"]),
    };
  }

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
    notes: [],
  };
  return runWithContextTarget(params, ctx, precise);
}

/** Run symbol-centered orientation sections for a precise target. */
async function runWithContextTarget(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
  precise: PreciseTarget,
): Promise<CodeIntelResult> {
  params.file = precise.file;
  params.line = precise.line;
  params.character = precise.character;
  params.targetName = precise.name;
  params.targetKind = precise.kind;
  params.targetAnchorKind = precise.anchorKind;

  const deps = await prepareContextDeps(params, ctx);
  if ("content" in deps) return deps;

  const result = await executeContext(
    {
      target: buildContextTarget(params),
      maxResults: params.maxResults ?? 10,
      showGitContext: false,
    },
    { ...deps, cwd: ctx.cwd },
  );

  const targetMeta = buildTargetMetadata(precise, ctx.cwd);
  const content = prependNotes(result.content, precise.notes, targetMeta);
  const details: ContextDetails = { ...result.details, target: targetMeta };
  return { content, details: { type: "context", data: details } };
}

/** Shared context dependencies (provider/model/lsp) or a readiness error result. */
type ContextDeps = Omit<UseCaseContextDeps, "cwd"> | CodeIntelResult;

async function prepareContextDeps(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<ContextDeps> {
  const readinessResult = await gateSemanticReadiness(params, ctx.cwd);
  if (readinessResult) return readinessResult;

  const providerState = ctx.session.getProviders();
  const provider: CodeProvider | null =
    providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };
  const model = await buildArchitectureModel(ctx.cwd);
  return { model, provider, lspService };
}

function resolveOrientationFocus(
  focus: string | undefined,
  cwd: string,
  model: ArchitectureModel | null,
): { kind: "ok"; path: string | undefined } | { kind: "error"; reason: string } {
  if (!focus) return { kind: "ok", path: undefined };

  const pathCandidate = normalizePath(focus, cwd);
  if (existsSync(pathCandidate)) return { kind: "ok", path: pathCandidate };

  const matches =
    model?.modules.filter(
      (mod) => mod.name === focus || mod.name.replace(/^@[^/]+\//, "") === focus,
    ) ?? [];
  if (matches.length === 1) return { kind: "ok", path: matches[0].root };
  if (matches.length > 1) {
    const candidates = matches
      .map((mod) => `\`${mod.name}\` at \`${mod.relativePath}\``)
      .join(", ");
    return { kind: "error", reason: `Focus is ambiguous: ${candidates}` };
  }

  return {
    kind: "error",
    reason: `Focus not found: \`${focus}\`. Provide a workspace-relative path or discovered module name.`,
  };
}

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

function buildContextTarget(params: CodeOrientationToolParams) {
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

/** Validate that focus, line, and character are all present for coordinate mode. */
function validateCoordinateParams(params: CodeOrientationToolParams, cwd: string): string | null {
  const hasFocus = params.focus !== undefined && params.focus.length > 0;
  const hasLine = params.line !== undefined;
  const hasChar = params.character !== undefined;
  if (!hasFocus || !hasLine || !hasChar) {
    return "**Error:** Symbol orientation requires all of `focus`, `line`, and `character` together.";
  }

  const resolvedFocus = normalizePath(params.focus ?? "", cwd);
  if (!existsSync(resolvedFocus)) {
    return `**Error:** Focus path not found: \`${params.focus}\``;
  }
  if (statSync(resolvedFocus).isDirectory()) {
    return "**Error:** `focus` points to a directory. `line` and `character` require a file focus.";
  }
  return null;
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

/** Prepend notes + a resolved-target summary to rendered orientation content. */
function prependNotes(content: string, notes: string[], target: ResolvedTargetMetadata): string {
  const head: string[] = [];
  if (notes.length > 0) {
    head.push(notes.join("\n\n"));
    head.push("");
  }
  const namePart = target.name ? ` **${target.name}**` : "";
  head.push(
    `Resolved target${namePart}: \`${target.file}\`:${target.displayLine}:${target.displayCharacter} — Target ID: \`${target.targetId}\``,
  );
  head.push("");
  return `${head.join("\n")}${content}`;
}

/** Resolve a workspace-relative file to absolute. */
function resolveAbsFile(cwd: string, relFile: string): string {
  return resolve(cwd, relFile);
}

async function gateSemanticReadiness(
  params: CodeOrientationToolParams,
  cwd: string,
): Promise<CodeIntelResult | null> {
  const hasSemanticTarget = params.file != null && params.line != null && params.character != null;
  if (!hasSemanticTarget) return null;

  const readiness = await ensureSemanticReadiness(
    cwd,
    params.file ? { kind: "file", file: params.file } : { kind: "workspace" },
  );
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_orientation", 15_000),
      details: unavailableContextDetails(["Retry shortly or check `code_health`"]),
    };
  }
  return null;
}
