/**
 * Cross-field validation rules for tool parameters.
 *
 * pi validates structural types, required fields, and enum values against
 * the TypeBox schemas in ./schemas.ts before calling tool executors. These
 * composable rules cover constraints that TypeBox cannot express:
 *
 * - Cross-field requirements (e.g. "query OR file required")
 * - Filesystem checks (e.g. "file exists and is not a directory")
 * - Semantic consistency (e.g. "kind only valid with mode: ast")
 *
 * TypeBox already enforces, and rules here must NOT duplicate:
 * - Required vs optional fields
 * - Enum value membership (StringEnum)
 * - Number ranges (minimum/maximum)
 * - additionalProperties: false
 */

import { existsSync, statSync } from "node:fs";
import { normalizePath } from "../analysis/search/helpers.ts";

/** A cross-field validation rule. Returns an error message string or null if valid. */
export type CrossFieldRule<P> = (params: P, cwd: string) => string | null;

/** Compose multiple cross-field rules — stops at the first error. */
export function composeRules<P>(...rules: CrossFieldRule<P>[]): CrossFieldRule<P> {
  return (params, cwd) => {
    for (const rule of rules) {
      const error = rule(params, cwd);
      if (error) return error;
    }
    return null;
  };
}

// ── Primitives ────────────────────────────────────────────────────────

/**
 * Require at least one of the named keys to be present and non-empty.
 * A key is "present" when its value is not undefined, null, or empty-string.
 */
export function requireAtLeastOne<P>(...keys: (keyof P & string)[]): CrossFieldRule<P> {
  return (params) => {
    const present = keys.filter((k) => {
      const v = (params as Record<string, unknown>)[k];
      return v !== undefined && v !== null && (typeof v !== "string" || v.length > 0);
    });
    if (present.length === 0) {
      const names = keys.map((k) => `\`${k}\``).join(" or ");
      return `**Error:** At least one of ${names} is required.`;
    }
    return null;
  };
}

/**
 * Require that the named keys appear together — all present or all absent.
 * A key is "present" when its value is not undefined or null.
 */
export function requirePaired<P>(...keys: (keyof P & string)[]): CrossFieldRule<P> {
  return (params) => {
    const record = params as Record<string, unknown>;
    const present = keys.map((k) => record[k] !== undefined && record[k] !== null);
    const allPresent = present.every(Boolean);
    const allAbsent = present.every((p) => !p);
    if (!allPresent && !allAbsent) {
      const names = keys.map((k) => `\`${k}\``).join(" and ");
      return `**Error:** ${names} must be provided together.`;
    }
    return null;
  };
}

/**
 * Require that when any of `dependentKeys` is present, `requiredKey` must
 * also be present.
 */
export function requireWith<P>(
  requiredKey: keyof P & string,
  ...dependentKeys: (keyof P & string)[]
): CrossFieldRule<P> {
  return (params) => {
    const record = params as Record<string, unknown>;
    const needed = dependentKeys.some((k) => record[k] !== undefined && record[k] !== null);
    if (needed && (record[requiredKey] === undefined || record[requiredKey] === null)) {
      const depNames = dependentKeys.map((k) => `\`${k}\``).join(" or ");
      return `**Error:** ${depNames} requires \`${requiredKey}\`.`;
    }
    return null;
  };
}

/**
 * Reject when any of `positionKeys` are present alongside `pathKey`.
 * Positions (line/character) only anchor into files, not scope/path params.
 */
export function noPositionOnPath<P>(
  pathKey: keyof P & string,
  lineKey: keyof P & string,
  charKey: keyof P & string,
): CrossFieldRule<P> {
  return (params) => {
    const record = params as Record<string, unknown>;
    const hasPath = record[pathKey] !== undefined;
    const hasPos = record[lineKey] !== undefined || record[charKey] !== undefined;
    if (hasPath && hasPos) {
      return `**Error:** \`${lineKey}\` and \`${charKey}\` require \`file\`, not \`${pathKey}\`. Use \`${pathKey}\` to scope; use \`file\` to anchor a position.`;
    }
    return null;
  };
}

// ── Filesystem primitives ─────────────────────────────────────────────

/** Ensure the value at `key` resolves to an existing file. */
export function fileMustExist<P>(key: keyof P & string): CrossFieldRule<P> {
  return (params, cwd) => {
    const file = (params as Record<string, unknown>)[key] as string | undefined;
    if (!file) return null;
    const resolved = normalizePath(file, cwd);
    if (!existsSync(resolved)) {
      return `**Error:** File not found: \`${file}\`.`;
    }
    return null;
  };
}

/** Ensure the value at `key` resolves to a file, not a directory. */
export function fileNotDirectory<P>(key: keyof P & string): CrossFieldRule<P> {
  return (params, cwd) => {
    const file = (params as Record<string, unknown>)[key] as string | undefined;
    if (!file) return null;
    const resolved = normalizePath(file, cwd);
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return `**Error:** \`${key}\` points to a directory. Use \`scope\` for a directory; use \`file\` to anchor a position in a file.`;
    }
    return null;
  };
}

// ── Tool-specific composed rules ──────────────────────────────────────

/**
 * Standard cross-field rules for tools that accept anchored coordinates
 * (file + line + character). Used by code_graph, code_impact, code_inspect,
 * and any future tool that takes position params.
 *
 * TypeBox already enforces:
 * - Types: file (String), line (Number >= 1), character (Number >= 1)
 * - additionalProperties: false
 */
export function focusedToolRules<P>(
  pathKey: keyof P & string = "scope" as keyof P & string,
): CrossFieldRule<P> {
  return composeRules<P>(
    noPositionOnPath(pathKey, "line" as keyof P & string, "character" as keyof P & string),
    fileNotDirectory("file" as keyof P & string),
    requireWith(
      "file" as keyof P & string,
      "line" as keyof P & string,
      "character" as keyof P & string,
    ),
  );
}

/**
 * Cross-field rules for code_resolve.
 *
 * TypeBox already enforces:
 * - kind must be a valid StringEnum value
 * - line/character must be numbers >= 1
 * - additionalProperties: false
 */
export const resolveCrossFieldRules: CrossFieldRule<{
  query?: string;
  file?: string;
  line?: number;
  character?: number;
}> = composeRules(
  requireAtLeastOne("query", "file"),
  requirePaired("line", "character"),
  requireWith("file", "line", "character"),
);

/**
 * Cross-field rules for code_orientation coordinate mode
 * (focus + line + character).
 *
 * TypeBox already enforces:
 * - line/character types and min >= 1
 * - additionalProperties: false
 */
export function orientationCoordinateRules<
  P extends {
    focus?: string;
    line?: number;
    character?: number;
  },
>(): CrossFieldRule<P> {
  return composeRules<P>(
    requirePaired(
      "focus" as keyof P & string,
      "line" as keyof P & string,
      "character" as keyof P & string,
    ),
    fileMustExist("focus" as keyof P & string),
    fileNotDirectory("focus" as keyof P & string),
  );
}

/**
 * Cross-field rules for code_find mode+kind consistency.
 *
 * TypeBox already enforces:
 * - mode must be a valid StringEnum value
 * - kind must be a valid StringEnum value
 * - query is required (not optional)
 */
const SUPPORTED_AST_KINDS = [
  "definition",
  "import",
  "export",
  "call",
  "type",
  "interface",
  "class",
  "method",
  "enum",
  "test",
] as const;

const SUPPORTED_AST_KINDS_TEXT = SUPPORTED_AST_KINDS.map((k) => `\`${k}\``).join(", ");

export function findModeKindRules<P extends { mode?: string; kind?: string }>(): CrossFieldRule<P> {
  return (params) => {
    const mode = params.mode ?? "text";
    const kind = params.kind;
    if ((mode === "text" || mode === "regex" || mode === "semantic") && kind) {
      return `**Error:** code_find does not accept \`kind\` with \`mode: "${mode}"\`. Use \`mode: "ast"\` with \`kind\`.`;
    }
    if (mode === "ast" && !kind) {
      return `**Error:** code_find with \`mode: "ast"\` requires \`kind\`. Supported AST kinds: ${SUPPORTED_AST_KINDS_TEXT}.`;
    }
    return null;
  };
}

/**
 * Cross-field rules for code_refactor_plan.
 *
 * TypeBox already enforces:
 * - operation must be a valid StringEnum value
 * - range shape (start/end with line/character)
 * - additionalProperties: false
 */
// ── Refactor plan sub-rules (split for complexity) ────────────────────

function checkExtractRange<
  P extends {
    operation: string;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  },
>(params: P): string | null {
  const isExtract =
    params.operation === "extract_function" || params.operation === "extract_variable";
  if (!isExtract) return null;
  if (!params.range) {
    return "**Error:** `range` is required for `extract_function` and `extract_variable`.";
  }
  const { start, end } = params.range;
  if (end.line < start.line || (end.line === start.line && end.character <= start.character)) {
    return "**Error:** `range.end` must be after `range.start`.";
  }
  return null;
}

function checkNewNameRequired<P extends { operation: string; newName?: string }>(
  params: P,
): string | null {
  const needsName =
    params.operation === "rename_symbol" ||
    params.operation === "extract_function" ||
    params.operation === "extract_variable";
  if (needsName && !params.newName) {
    return `**Error:** \`newName\` is required for \`${params.operation}\`.`;
  }
  return null;
}

/**
 * Cross-field rules for code_refactor_plan.
 *
 * TypeBox already enforces:
 * - operation must be a valid StringEnum value
 * - range shape (start/end with line/character)
 * - additionalProperties: false
 */
export function refactorPlanCrossFieldRules<
  P extends {
    operation: string;
    targetId?: string;
    file?: string;
    line?: number;
    character?: number;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    newName?: string;
  },
>(): CrossFieldRule<P> {
  return composeRules<P>(
    (params) => {
      const hasTarget =
        Boolean(params.targetId) ||
        (Boolean(params.file) && params.line != null && params.character != null);
      if (!hasTarget) {
        return "**Error:** Refactor preview requires `targetId` (from `code_resolve`) or `file` + `line` + `character`.";
      }
      return null;
    },
    checkExtractRange as CrossFieldRule<P>,
    checkNewNameRequired as CrossFieldRule<P>,
  );
}
