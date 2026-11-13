/** Runtime parsers for inspection, Orientation, graph, and find workflows. */

import { isCodeFindAstKind } from "../../tool/code_find/ast-kinds.ts";
import { CODE_FIND_MODES } from "../../tool/code_find/modes.ts";
import type { FindMode, FindSearchInput, FindWorkflowInput } from "../find-types.ts";
import type { GraphWorkflowInput, RequestedGraphRelation } from "../graph-types.ts";
import type { InspectWorkflowInput } from "../inspect-types.ts";
import type { OrientationFocusInput, OrientationWorkflowInput } from "../orientation-types.ts";
import type { GraphTargetInput, OrientationTargetInput } from "../target-input.ts";
import {
  type InputValidation,
  invalid,
  optionalPositiveInteger,
  parseSourcePoint,
  parseTargetInput,
  requireOnlyKeys,
  requireRecord,
  requireString,
  valid,
} from "./common.ts";

const GRAPH_RELATIONS = new Set<RequestedGraphRelation>([
  "all",
  "references",
  "callees",
  "implements",
]);

export function parseInspectWorkflowInput(value: unknown): InputValidation<InspectWorkflowInput> {
  const record = requireRecord(value, "code_inspect input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["anchor", "maxResults"], "code_inspect input");
  if (keysError) return invalid(keysError);
  const anchor = parseSourcePoint(record.value.anchor, "anchor");
  if (anchor.kind === "invalid-input") return anchor;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    anchor: anchor.value,
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
    ["search", "scopes", "maxResults"],
    "code_find input",
  );
  if (keysError) return invalid(keysError);
  const search = parseFindSearch(record.value.search);
  if (search.kind === "invalid-input") return search;
  const scopes = parseFindScopes(record.value.scopes);
  if (scopes.kind === "invalid-input") return scopes;
  const maxResults = optionalPositiveInteger(record.value.maxResults, "maxResults");
  if (maxResults.kind === "invalid-input") return maxResults;
  return valid({
    search: search.value,
    ...(scopes.value === undefined ? {} : { scopes: scopes.value }),
    ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
  });
}

function parseFindSearch(value: unknown): InputValidation<FindSearchInput> {
  const record = requireRecord(value, "search");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, CODE_FIND_MODES, "search");
  if (keysError) return invalid(keysError);
  const selected = CODE_FIND_MODES.filter((mode) => record.value[mode] !== undefined);
  if (selected.length !== 1) {
    return invalid("search must contain exactly one of `ast` or `semantic`.");
  }
  const mode = selected[0] as FindMode;
  const label = `search.${mode}`;
  const branch = requireRecord(record.value[mode], label);
  if (branch.kind === "invalid-input") return branch;
  const branchKeysError = requireOnlyKeys(
    branch.value,
    mode === "ast" ? ["kind", "query"] : ["query"],
    label,
  );
  if (branchKeysError) return invalid(branchKeysError);
  const query = requireString(branch.value.query, `${label}.query`, { nonEmpty: true });
  if (query.kind === "invalid-input") return query;
  if (mode === "semantic") return valid({ semantic: { query: query.value } });
  return isCodeFindAstKind(branch.value.kind)
    ? valid({ ast: { kind: branch.value.kind, query: query.value } })
    : invalid(
        branch.value.kind === undefined ? "search.ast.kind is required." : "Unsupported AST kind.",
      );
}

function parseFindScopes(value: unknown): InputValidation<readonly string[] | undefined> {
  if (value === undefined) return valid(undefined);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string")
  ) {
    return invalid("scopes must be a non-empty array of workspace-relative paths.");
  }
  if (value.some((item) => item.trim().length === 0)) {
    return invalid("scopes must not contain empty paths.");
  }
  return valid(value);
}
