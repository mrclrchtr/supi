/** Common runtime input-validation primitives for session workflows. */

import {
  type AnchorTargetInput,
  type ResolveTargetInput,
  type SourcePointInput,
  type SymbolTargetInput,
  TARGET_SYMBOL_KINDS,
  type TargetInput,
  type TargetSymbolKind,
} from "../target-input.ts";

/** A parsed workflow input or an agent-correctable validation error. */
export type InputValidation<T> =
  | { readonly kind: "valid"; readonly value: T }
  | { readonly kind: "invalid-input"; readonly message: string };

const SYMBOL_KINDS = new Set<TargetSymbolKind>(TARGET_SYMBOL_KINDS);

type TargetBranch = "handle" | "anchor" | "symbol" | "file";

export function valid<T>(value: T): InputValidation<T> {
  return { kind: "valid", value };
}

export function invalid<T = never>(message: string): InputValidation<T> {
  return { kind: "invalid-input", message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(
  value: unknown,
  label: string,
): InputValidation<Record<string, unknown>> {
  return isRecord(value) ? valid(value) : invalid(`${label} must be an object.`);
}

export function requireOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): string | null {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  return unexpected.length > 0
    ? `${label} contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.map((key) => `\`${key}\``).join(", ")}.`
    : null;
}

export function requireString(
  value: unknown,
  label: string,
  options: { nonEmpty?: boolean } = {},
): InputValidation<string> {
  if (typeof value !== "string") return invalid(`${label} must be a string.`);
  if (options.nonEmpty && value.trim().length === 0) return invalid(`${label} must not be empty.`);
  return valid(value);
}

export function optionalString(
  value: unknown,
  label: string,
  options: { nonEmpty?: boolean } = {},
): InputValidation<string | undefined> {
  return value === undefined ? valid(undefined) : requireString(value, label, options);
}

export function optionalPositiveInteger(
  value: unknown,
  label: string,
): InputValidation<number | undefined> {
  if (value === undefined) return valid(undefined);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return invalid(`${label} must be a positive integer.`);
  }
  return valid(value);
}

export function optionalNonNegativeInteger(
  value: unknown,
  label: string,
): InputValidation<number | undefined> {
  if (value === undefined) return valid(undefined);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return invalid(`${label} must be a non-negative integer.`);
  }
  return valid(value);
}

export function parsePosition(
  value: unknown,
  label: string,
): InputValidation<Omit<SourcePointInput, "file">> {
  const record = requireRecord(value, label);
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["line", "character"], label);
  if (keysError) return invalid(keysError);
  const line = optionalPositiveInteger(record.value.line, `${label}.line`);
  if (line.kind === "invalid-input" || line.value === undefined) {
    return line.kind === "invalid-input" ? line : invalid(`${label}.line is required.`);
  }
  const character = optionalPositiveInteger(record.value.character, `${label}.character`);
  if (character.kind === "invalid-input" || character.value === undefined) {
    return character.kind === "invalid-input"
      ? character
      : invalid(`${label}.character is required.`);
  }
  return valid({ line: line.value, character: character.value });
}

/** Parse one exact 1-based source point. */
export function parseSourcePoint(
  value: unknown,
  label = "point",
): InputValidation<SourcePointInput> {
  const record = requireRecord(value, label);
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["file", "line", "character"], label);
  if (keysError) return invalid(keysError);
  const file = requireString(record.value.file, `${label}.file`, { nonEmpty: true });
  if (file.kind === "invalid-input") return file;
  const position = parsePosition(
    { line: record.value.line, character: record.value.character },
    label,
  );
  if (position.kind === "invalid-input") return position;
  return valid({ file: file.value, ...position.value });
}

function parseSymbolTarget(value: unknown): InputValidation<SymbolTargetInput> {
  const record = requireRecord(value, "target.symbol");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["query", "scope", "symbolKind"],
    "target.symbol",
  );
  if (keysError) return invalid(keysError);
  const query = requireString(record.value.query, "target.symbol.query", { nonEmpty: true });
  if (query.kind === "invalid-input") return query;
  const scope = optionalString(record.value.scope, "target.symbol.scope", { nonEmpty: true });
  if (scope.kind === "invalid-input") return scope;
  const symbolKind = optionalString(record.value.symbolKind, "target.symbol.symbolKind");
  if (symbolKind.kind === "invalid-input") return symbolKind;
  if (symbolKind.value !== undefined && !SYMBOL_KINDS.has(symbolKind.value as TargetSymbolKind)) {
    return invalid(
      "target.symbol.symbolKind must be a provider-reported LSP SymbolKind; omit it when the provider category is uncertain.",
    );
  }
  return valid({
    query: query.value,
    ...(scope.value === undefined ? {} : { scope: scope.value }),
    ...(symbolKind.value === undefined ? {} : { symbolKind: symbolKind.value as TargetSymbolKind }),
  });
}

/** Parse an exact-one target selector and enforce the branches an intent supports. */
export function parseTargetInput(
  value: unknown,
  allowed: readonly TargetBranch[],
): InputValidation<TargetInput> {
  const record = requireRecord(value, "target");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["handle", "anchor", "symbol", "file"], "target");
  if (keysError) return invalid(keysError);
  const selected = (["handle", "anchor", "symbol", "file"] as const).filter(
    (key) => record.value[key] !== undefined,
  );
  if (selected.length !== 1) {
    return invalid(
      "A target selector must contain exactly one of `handle`, `anchor`, `symbol`, or `file`.",
    );
  }
  const branch = selected[0];
  if (!allowed.includes(branch)) return invalid(`This workflow does not support target.${branch}.`);

  switch (branch) {
    case "handle": {
      const handle = requireString(record.value.handle, "target.handle", { nonEmpty: true });
      return handle.kind === "valid" ? valid({ handle: handle.value }) : handle;
    }
    case "anchor": {
      const anchor = parseSourcePoint(record.value.anchor, "target.anchor");
      return anchor.kind === "valid"
        ? valid({ anchor: anchor.value } satisfies AnchorTargetInput)
        : anchor;
    }
    case "symbol": {
      const symbol = parseSymbolTarget(record.value.symbol);
      return symbol.kind === "valid" ? valid({ symbol: symbol.value }) : symbol;
    }
    case "file": {
      const file = requireString(record.value.file, "target.file", { nonEmpty: true });
      return file.kind === "valid" ? valid({ file: file.value }) : file;
    }
  }
}

export function parseResolveRequest(
  value: unknown,
): InputValidation<{ readonly target: ResolveTargetInput; readonly maxResults?: number }> {
  const record = requireRecord(value, "code_resolve input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["target", "maxResults"], "code_resolve input");
  if (keysError) return invalid(keysError);
  const target = parseTargetInput(record.value.target, ["anchor", "symbol", "file"]);
  if (target.kind === "invalid-input") return target;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    target: target.value as ResolveTargetInput,
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}
