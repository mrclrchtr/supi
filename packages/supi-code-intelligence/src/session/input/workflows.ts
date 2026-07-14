/** Runtime parsers for inspection, Orientation, graph, and find workflows. */

import {
  isStructuredPatternKind,
  type StructuredPatternKind,
} from "../../analysis/search/pattern.ts";
import type { FindMode, FindWorkflowInput } from "../find-types.ts";
import type { GraphWorkflowInput, RequestedGraphRelation } from "../graph-types.ts";
import type { InspectWorkflowInput } from "../inspect-types.ts";
import type { OrientationFocusInput, OrientationWorkflowInput } from "../orientation-types.ts";
import type { GraphTargetInput, OrientationTargetInput } from "../target-input.ts";
import {
  type InputValidation,
  invalid,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  parseSourcePoint,
  parseTargetInput,
  requireOnlyKeys,
  requireRecord,
  requireString,
  valid,
} from "./common.ts";

const FIND_MODES = new Set<FindMode>(["text", "regex", "ast", "semantic"]);
const GRAPH_RELATIONS = new Set<RequestedGraphRelation>([
  "all",
  "references",
  "callees",
  "implements",
]);

export function parseInspectWorkflowInput(value: unknown): InputValidation<InspectWorkflowInput> {
  const record = requireRecord(value, "code_inspect input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["point", "maxResults"], "code_inspect input");
  if (keysError) return invalid(keysError);
  const point = parseSourcePoint(record.value.point);
  if (point.kind === "invalid-input") return point;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    point: point.value,
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}

export function parseOrientationWorkflowInput(
  value: unknown,
): InputValidation<OrientationWorkflowInput> {
  const record = requireRecord(value, "code_orientation input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["focus", "maxResults"],
    "code_orientation input",
  );
  if (keysError) return invalid(keysError);
  const focus = parseOrientationFocus(record.value.focus);
  if (focus.kind === "invalid-input") return focus;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    ...(focus.value === undefined ? {} : { focus: focus.value }),
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}

function parseOrientationFocus(value: unknown): InputValidation<OrientationFocusInput | undefined> {
  if (value === undefined) return valid(undefined);
  const record = requireRecord(value, "focus");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["path", "module", "target"], "focus");
  if (keysError) return invalid(keysError);
  const selected = (["path", "module", "target"] as const).filter(
    (key) => record.value[key] !== undefined,
  );
  if (selected.length !== 1) {
    return invalid("focus must contain exactly one of `path`, `module`, or `target`.");
  }
  if (selected[0] === "path") {
    const path = requireString(record.value.path, "focus.path", { nonEmpty: true });
    return path.kind === "valid" ? valid({ path: path.value }) : path;
  }
  if (selected[0] === "module") {
    const module = requireString(record.value.module, "focus.module", { nonEmpty: true });
    return module.kind === "valid" ? valid({ module: module.value }) : module;
  }
  const target = parseTargetInput(record.value.target, ["handle", "anchor", "symbol"]);
  return target.kind === "valid"
    ? valid({ target: target.value as OrientationTargetInput })
    : target;
}

export function parseGraphWorkflowInput(value: unknown): InputValidation<GraphWorkflowInput> {
  const record = requireRecord(value, "code_graph input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["target", "relations", "calleeDepth", "maxResults"],
    "code_graph input",
  );
  if (keysError) return invalid(keysError);
  const target = parseTargetInput(record.value.target, ["handle", "anchor", "symbol"]);
  if (target.kind === "invalid-input") return target;
  const relations = parseRelations(record.value.relations);
  if (relations.kind === "invalid-input") return relations;
  const calleeDepth = parseCalleeDepth(record.value.calleeDepth);
  if (calleeDepth.kind === "invalid-input") return calleeDepth;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    target: target.value as GraphTargetInput,
    ...(relations.value === undefined ? {} : { relations: relations.value }),
    ...(calleeDepth.value === undefined ? {} : { calleeDepth: calleeDepth.value }),
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}

function parseRelations(
  value: unknown,
): InputValidation<readonly RequestedGraphRelation[] | undefined> {
  if (value === undefined) return valid(undefined);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string")
  ) {
    return invalid("relations must be a non-empty array of supported relation names.");
  }
  if (
    new Set(value).size !== value.length ||
    !value.every((item) => GRAPH_RELATIONS.has(item as RequestedGraphRelation))
  ) {
    return invalid("relations contains an unsupported or duplicate relation.");
  }
  if (value.includes("all") && value.length !== 1) {
    return invalid('`relations: ["all"]` cannot be combined with named relations.');
  }
  return valid(value as RequestedGraphRelation[]);
}

function parseCalleeDepth(value: unknown): InputValidation<"direct" | "deep" | undefined> {
  if (value === undefined) return valid(undefined);
  return value === "direct" || value === "deep"
    ? valid(value)
    : invalid('calleeDepth must be "direct" or "deep".');
}

export function parseFindWorkflowInput(value: unknown): InputValidation<FindWorkflowInput> {
  const record = requireRecord(value, "code_find input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["query", "scope", "mode", "kind", "contextLines", "maxResults"],
    "code_find input",
  );
  if (keysError) return invalid(keysError);
  const query = requireString(record.value.query, "query", { nonEmpty: true });
  if (query.kind === "invalid-input") return query;
  const scope = parseFindScope(record.value.scope);
  if (scope.kind === "invalid-input") return scope;
  const mode = parseFindMode(record.value.mode);
  if (mode.kind === "invalid-input") return mode;
  const patternKind = parsePatternKind(record.value.kind);
  if (patternKind.kind === "invalid-input") return patternKind;
  const modeError = validateFindModeFields(mode.value, patternKind.value);
  if (modeError) return invalid(modeError);
  const contextLines = optionalNonNegativeInteger(record.value.contextLines, "contextLines");
  if (contextLines.kind === "invalid-input") return contextLines;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    query: query.value,
    ...(scope.value === undefined ? {} : { scope: scope.value }),
    ...(mode.value === "text" && record.value.mode === undefined ? {} : { mode: mode.value }),
    ...(patternKind.value === undefined ? {} : { kind: patternKind.value }),
    ...(contextLines.value === undefined ? {} : { contextLines: contextLines.value }),
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}

function parseFindScope(value: unknown): InputValidation<readonly string[] | undefined> {
  if (value === undefined) return valid(undefined);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string")
  ) {
    return invalid("scope must be a non-empty array of workspace-relative paths.");
  }
  if (value.some((item) => item.trim().length === 0) || new Set(value).size !== value.length) {
    return invalid("scope must not contain empty or duplicate paths.");
  }
  return valid(value);
}

function parseFindMode(value: unknown): InputValidation<FindMode> {
  if (value === undefined) return valid("text");
  return typeof value === "string" && FIND_MODES.has(value as FindMode)
    ? valid(value as FindMode)
    : invalid("mode must be one of text, regex, ast, or semantic.");
}

function parsePatternKind(value: unknown): InputValidation<StructuredPatternKind | undefined> {
  if (value === undefined) return valid(undefined);
  return typeof value === "string" && isStructuredPatternKind(value)
    ? valid(value)
    : invalid("Unsupported AST kind.");
}

function validateFindModeFields(
  mode: FindMode,
  patternKind: StructuredPatternKind | undefined,
): string | null {
  if (mode === "ast" && patternKind === undefined) return 'mode "ast" requires kind.';
  return mode !== "ast" && patternKind !== undefined
    ? `kind is not valid with mode "${mode}".`
    : null;
}
