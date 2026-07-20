/** Runtime parsers for health and refactor session workflows. */

import type { HealthSection, HealthWorkflowInput } from "../health-types.ts";
import type {
  PublicSourceRange,
  RefactorApplyWorkflowInput,
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
} from "../refactor-types.ts";
import type { RefactorTargetInput } from "../target-input.ts";
import {
  type InputValidation,
  invalid,
  optionalString,
  parsePosition,
  parseTargetInput,
  requireOnlyKeys,
  requireRecord,
  requireString,
  valid,
} from "./common.ts";

const HEALTH_SECTIONS = new Set<HealthSection>(["diagnostics", "servers", "dirty"]);

export function parseHealthWorkflowInput(value: unknown): InputValidation<HealthWorkflowInput> {
  const record = requireRecord(value, "code_health input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["scope", "refresh", "include", "level"],
    "code_health input",
  );
  if (keysError) return invalid(keysError);
  const scope = optionalString(record.value.scope, "scope");
  if (scope.kind === "invalid-input") return scope;
  const refresh = parseRefresh(record.value.refresh);
  if (refresh.kind === "invalid-input") return refresh;
  const level = parseHealthLevel(record.value.level);
  if (level.kind === "invalid-input") return level;
  const include = parseHealthSections(record.value.include);
  if (include.kind === "invalid-input") return include;
  return valid({
    ...(scope.value === undefined ? {} : { scope: scope.value }),
    ...(refresh.value === undefined ? {} : { refresh: refresh.value }),
    ...(include.value === undefined ? {} : { include: include.value }),
    ...(level.value === undefined ? {} : { level: level.value }),
  });
}

function parseRefresh(value: unknown): InputValidation<boolean | undefined> {
  if (value === undefined || typeof value === "boolean") return valid(value);
  return invalid("refresh must be a boolean.");
}

function parseHealthLevel(value: unknown): InputValidation<"summary" | "detailed" | undefined> {
  if (value === undefined || value === "summary" || value === "detailed") return valid(value);
  return invalid('level must be "summary" or "detailed".');
}

function parseHealthSections(
  value: unknown,
): InputValidation<readonly HealthSection[] | undefined> {
  if (value === undefined) return valid(undefined);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return invalid("include must be an array of health sections.");
  }
  if (
    new Set(value).size !== value.length ||
    !value.every((item) => HEALTH_SECTIONS.has(item as HealthSection))
  ) {
    return invalid("include contains an unsupported or duplicate health section.");
  }
  return valid(value as HealthSection[]);
}

export function parseRefactorPlanWorkflowInput(
  value: unknown,
): InputValidation<RefactorPlanWorkflowInput> {
  const record = requireRecord(value, "code_refactor_plan input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["target", "operation"],
    "code_refactor_plan input",
  );
  if (keysError) return invalid(keysError);
  const target = parseTargetInput(record.value.target, ["handle", "anchor"]);
  if (target.kind === "invalid-input") return target;
  const operation = parseRefactorOperation(record.value.operation);
  if (operation.kind === "invalid-input") return operation;
  return valid({ target: target.value as RefactorTargetInput, operation: operation.value });
}

function parseRefactorOperation(value: unknown): InputValidation<RefactorOperationInput> {
  const record = requireRecord(value, "operation");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(
    record.value,
    ["rename_symbol", "extract_function", "extract_variable"],
    "operation",
  );
  if (keysError) return invalid(keysError);
  const selected = (["rename_symbol", "extract_function", "extract_variable"] as const).filter(
    (key) => record.value[key] !== undefined,
  );
  if (selected.length !== 1) return invalid("Select exactly one refactor operation.");

  const name = selected[0];
  const payload = requireRecord(record.value[name], `operation.${name}`);
  if (payload.kind === "invalid-input") return payload;
  if (name === "rename_symbol") return parseRenameOperation(payload.value);
  return parseExtractOperation(name, payload.value);
}

function parseRenameOperation(
  payload: Record<string, unknown>,
): InputValidation<RefactorOperationInput> {
  const payloadError = requireOnlyKeys(payload, ["newName"], "operation.rename_symbol");
  if (payloadError) return invalid(payloadError);
  const newName = requireString(payload.newName, "operation.rename_symbol.newName", {
    nonEmpty: true,
  });
  return newName.kind === "valid" ? valid({ rename_symbol: { newName: newName.value } }) : newName;
}

function parseExtractOperation(
  name: "extract_function" | "extract_variable",
  payload: Record<string, unknown>,
): InputValidation<RefactorOperationInput> {
  const payloadError = requireOnlyKeys(payload, ["newName", "range"], `operation.${name}`);
  if (payloadError) return invalid(payloadError);
  const newName = requireString(payload.newName, `operation.${name}.newName`, { nonEmpty: true });
  if (newName.kind === "invalid-input") return newName;
  const range = parsePublicRange(payload.range);
  if (range.kind === "invalid-input") return range;
  return name === "extract_function"
    ? valid({ extract_function: { newName: newName.value, range: range.value } })
    : valid({ extract_variable: { newName: newName.value, range: range.value } });
}

function parsePublicRange(value: unknown): InputValidation<PublicSourceRange> {
  const record = requireRecord(value, "range");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["start", "end"], "range");
  if (keysError) return invalid(keysError);
  const start = parsePosition(record.value.start, "range.start");
  if (start.kind === "invalid-input") return start;
  const end = parsePosition(record.value.end, "range.end");
  if (end.kind === "invalid-input") return end;
  if (
    end.value.line < start.value.line ||
    (end.value.line === start.value.line && end.value.character <= start.value.character)
  ) {
    return invalid("range.end must be after range.start.");
  }
  return valid({ start: start.value, end: end.value });
}

export function parseRefactorApplyWorkflowInput(
  value: unknown,
): InputValidation<RefactorApplyWorkflowInput> {
  const record = requireRecord(value, "code_refactor_apply input");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["planId"], "code_refactor_apply input");
  if (keysError) return invalid(keysError);
  const planId = requireString(record.value.planId, "planId");
  if (planId.kind === "invalid-input") return planId;
  return planId.value.trim() ? valid({ planId: planId.value }) : invalid("planId is required.");
}
