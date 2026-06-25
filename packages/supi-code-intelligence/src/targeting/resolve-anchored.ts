/**
 * Anchored target resolution — resolves a file + position pair into a
 * typed target outcome using purely filesystem-level validation.
 *
 * This resolver does not require LSP or Tree-sitter. It validates
 * file existence, binary-file guards, and produces the necessary
 * position conversions for downstream semantic operations.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CodeResult,
  CodeSymbol,
  NodeAtData,
  SemanticProvider,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchoredResolutionMetadata, AnchoredResolutionSource } from "../types.ts";
import type { AnchorKind } from "../workflow/target-store.ts";
import type { DisambiguationCandidateData, ResolvedTargetData, TargetOutcome } from "./types.ts";

/** 1-based symbol anchor position (mirrors the runtime `SymbolAnchor`). */
type Anchor = { line: number; character: number };

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".pdf",
  ".doc",
  ".docx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".node",
]);

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// ── Provider-backed anchored symbol resolution ────────────────────────

/**
 * Minimal provider surface used by anchored symbol resolution — only the
 * methods the resolver actually consults. The composite `CodeProvider` from
 * `request-context.ts` satisfies this shape, as do focused test doubles.
 */
export interface AnchoredResolverProvider {
  documentSymbols?: SemanticProvider["documentSymbols"];
  nodeAt?: StructuralProvider["nodeAt"];
}

/** Tree-sitter node types that introduce a named declaration. */
const DECLARATION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_signature",
  "method_definition",
  "method_declaration",
  "method_signature",
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "type_alias_declaration",
  "lexical_declaration",
  "variable_declaration",
  "export_statement",
]);

/** Tree-sitter node types that represent non-symbol tokens. */
const NON_SYMBOL_NODE_TYPES = new Set([
  "comment",
  "line_comment",
  "block_comment",
  "string",
  "string_fragment",
  "template_string",
  "template_literal_type",
  "regex",
  "regex_pattern",
  "number",
  "escape_sequence",
]);

function kindFromDeclarationType(nodeType: string): string | null {
  if (nodeType.includes("function")) return "Function";
  if (nodeType.includes("method")) return "Method";
  if (nodeType.includes("class")) return "Class";
  if (nodeType.includes("interface")) return "Interface";
  if (nodeType.includes("enum")) return "Enum";
  if (nodeType.includes("type_alias")) return "Type";
  if (nodeType.includes("lexical") || nodeType.includes("variable")) return "Variable";
  return null;
}

/**
 * Classify how (or whether) a document symbol relates to a 1-based coordinate.
 *
 * - `"exact"` — the coordinate lands on the identifier token (name anchor).
 * - `"snap"` — the coordinate lands on the declaration header/modifier area
 *   on the declaration line, before the identifier, and a name anchor exists
 *   to snap to.
 * - `null` — no relationship.
 */
function matchSymbolAt(s: CodeSymbol, line: number, character: number): "exact" | "snap" | null {
  const nameAnchor = s.nameAnchor;
  if (nameAnchor && nameAnchor.line === line) {
    const start = nameAnchor.character;
    const end = start + s.name.length;
    if (character >= start && character < end) return "exact";
  }
  const decl = s.declarationAnchor;
  if (decl.line === line && nameAnchor && nameAnchor.line === line) {
    if (character >= decl.character && character < nameAnchor.character) return "snap";
  }
  return null;
}

function buildResolution(
  requested: Anchor,
  resolvedAnchor: Anchor,
  snapped: boolean,
  source: AnchoredResolutionSource,
): AnchoredResolutionMetadata {
  return {
    requested: { line: requested.line, character: requested.character },
    resolved: { line: resolvedAnchor.line, character: resolvedAnchor.character },
    snapped,
    source,
  };
}

function resolvedFromSymbol(
  file: string,
  s: CodeSymbol,
  opts: { snapped: boolean; requested: Anchor; source: AnchoredResolutionSource },
): { kind: "resolved"; target: ResolvedTargetData } {
  const a = (s.nameAnchor ?? s.declarationAnchor) as Anchor;
  return {
    kind: "resolved",
    target: {
      file,
      position: { line: a.line - 1, character: a.character - 1 },
      displayLine: a.line,
      displayCharacter: a.character,
      name: s.name,
      kind: s.kind,
      confidence: "semantic",
      anchorKind: (s.nameAnchor ? "name" : "declaration") as AnchorKind,
      container: s.container ?? null,
      resolution: buildResolution(opts.requested, a, opts.snapped, opts.source),
    },
  };
}

function candidatesFromSymbols(
  file: string,
  matched: CodeSymbol[],
): { kind: "disambiguation"; candidates: DisambiguationCandidateData[]; omittedCount: number } {
  const candidates = matched.map((s, idx) => {
    const a = (s.nameAnchor ?? s.declarationAnchor) as Anchor;
    return {
      name: s.name,
      kind: s.kind,
      container: s.container ?? null,
      file,
      line: a.line,
      character: a.character,
      reason: `${a.line}:${a.character}`,
      rank: idx + 1,
      anchorKind: (s.nameAnchor ? "name" : "declaration") as AnchorKind,
    } satisfies DisambiguationCandidateData;
  });
  return { kind: "disambiguation", candidates, omittedCount: 0 };
}

/** Layer 1: match the coordinate against LSP document symbols. Returns null to fall through. */
async function resolveFromSemantic(
  file: string,
  requested: Anchor,
  provider: AnchoredResolverProvider,
): Promise<TargetOutcome | null> {
  if (!provider.documentSymbols) return null;
  let symbols: CodeSymbol[] | null = null;
  try {
    symbols = await provider.documentSymbols(file);
  } catch {
    symbols = null;
  }
  if (!symbols || symbols.length === 0) return null;

  const exact: CodeSymbol[] = [];
  const snap: CodeSymbol[] = [];
  for (const s of symbols) {
    const m = matchSymbolAt(s, requested.line, requested.character);
    if (m === "exact") exact.push(s);
    else if (m === "snap") snap.push(s);
  }

  if (exact.length === 1) {
    return resolvedFromSymbol(file, exact[0], { snapped: false, requested, source: "semantic" });
  }
  if (exact.length > 1) return candidatesFromSymbols(file, exact);
  if (snap.length === 1) {
    return resolvedFromSymbol(file, snap[0], { snapped: true, requested, source: "semantic" });
  }
  if (snap.length > 1) return candidatesFromSymbols(file, snap);
  return null;
}

/** Layer 2: classify the coordinate via tree-sitter `nodeAt`. Returns null to fall through. */
async function resolveFromStructural(
  file: string,
  requested: Anchor,
  provider: AnchoredResolverProvider,
): Promise<TargetOutcome | null> {
  if (!provider.nodeAt) return null;
  let nodeResult: CodeResult<NodeAtData> | null = null;
  try {
    nodeResult = await provider.nodeAt(file, requested.line, requested.character);
  } catch {
    nodeResult = null;
  }
  if (nodeResult?.kind !== "success") return null;

  const node = nodeResult.data;
  if (NON_SYMBOL_NODE_TYPES.has(node.type)) {
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(file, requested.line, requested.character, node.type),
    };
  }
  if (node.type !== "identifier") {
    // Keyword/modifier/operator etc. — no LSP header snap available.
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(file, requested.line, requested.character, node.type),
    };
  }

  const declAncestor = node.ancestry.find((a) => DECLARATION_NODE_TYPES.has(a.type));
  if (!declAncestor) {
    // Identifier is a usage, not a declaration name.
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(
        file,
        requested.line,
        requested.character,
        "identifier usage",
      ),
    };
  }
  const nameAnchor: Anchor = { line: node.startLine, character: node.startCharacter };
  const snapped =
    nameAnchor.line !== requested.line || nameAnchor.character !== requested.character;
  return {
    kind: "resolved",
    target: {
      file,
      position: { line: nameAnchor.line - 1, character: nameAnchor.character - 1 },
      displayLine: nameAnchor.line,
      displayCharacter: nameAnchor.character,
      name: node.text,
      kind: kindFromDeclarationType(declAncestor.type),
      confidence: "structural",
      anchorKind: "name",
      container: null,
      resolution: buildResolution(requested, nameAnchor, snapped, "structural-identifier"),
    },
  };
}

/**
 * Resolve a real symbol target from anchored coordinates using provider
 * evidence. Replaces the anonymous point-target behavior for `code_resolve`
 * and `code_orientation`.
 *
 * Layered resolution (per the coordinated-targets plan):
 * 1. Prefer LSP document-symbol evidence: exact identifier hit, declaration
 *    header snap (only when exactly one enclosing symbol is unambiguous), or
 *    explicit disambiguation candidates.
 * 2. Structural fallback via tree-sitter `nodeAt` — only when unambiguous and
 *    provider-backed: an identifier token that is a declaration name resolves
 *    to a structural name-anchor target; comment/string/non-symbol nodes fail
 *    honestly.
 * 3. If no provider-backed symbol target can be resolved, return an explicit
 *    error recommending `code_inspect` for point-level facts.
 *
 * This does not perform heuristic global text search and does not silently
 * treat declaration anchors as name anchors (ADR 0003).
 */
export async function resolveAnchoredSymbolTarget(
  file: string,
  line: number,
  character: number,
  provider: AnchoredResolverProvider | null,
): Promise<TargetOutcome> {
  if (!fs.existsSync(file)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }
  if (isBinaryFile(file)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use \`code_find\` with \`mode: "text"\` for explicit text search.`,
    };
  }

  const requested: Anchor = { line, character };
  if (provider) {
    const semantic = await resolveFromSemantic(file, requested, provider);
    if (semantic) return semantic;
    const structural = await resolveFromStructural(file, requested, provider);
    if (structural) return structural;
  }

  return { kind: "error", message: coordinateNotOnSymbolMessage(file, line, character, null) };
}

function coordinateNotOnSymbolMessage(
  file: string,
  line: number,
  character: number,
  detail: string | null,
): string {
  const at = `${path.basename(file)}:${line}:${character}`;
  const reason = detail ? ` (on \`${detail}\`)` : "";
  return (
    `**Error:** No symbol target resolved at \`${at}\`${reason}. ` +
    "`code_resolve` resolves real symbol targets from provider-backed evidence; " +
    "use `code_inspect` for point-level facts at this coordinate, or pass the identifier coordinate of a declaration."
  );
}
