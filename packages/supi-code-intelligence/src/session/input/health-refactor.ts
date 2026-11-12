/** Runtime parsers for health and refactor session workflows. */

import type { HealthSection, HealthWorkflowInput } from "../health-types.ts";
import {
  PUBLIC_REFACTOR_OPERATION_NAMES,
  type PublicSourceRange,
  type RefactorApplyWorkflowInput,
  type RefactorOperationInput,
  type RefactorPlanWorkflowInput,
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

const HEALTH_SECTIONS = new Set<HealthSection>(["diagnostics", "servers"]);

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
  const keysError = requireOnlyKeys(record.value, ["operation"], "code_refactor_plan input");
  if (keysError) return invalid(keysError);
  const operation = parseRefactorOperation(record.value.operation);
  if (operation.kind === "invalid-input") return operation;
  return valid({ operation: operation.value });
}

function parseRefactorOperation(value: unknown): InputValidation<RefactorOperationInput> {
  const record = requireRecord(value, "operation");
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, PUBLIC_REFACTOR_OPERATION_NAMES, "operation");
  if (keysError) return invalid(keysError);
  const selected = PUBLIC_REFACTOR_OPERATION_NAMES.filter((key) => record.value[key] !== undefined);
  if (selected.length !== 1) return invalid("Select exactly one refactor operation.");

  const name = selected[0];
  const payload = requireRecord(record.value[name], `operation.${name}`);
  if (payload.kind === "invalid-input") return payload;
  if (name === "rename_symbol") return parseRenameOperation(payload.value);
  return parseActionOperation(name, payload.value);
}

function parseRenameOperation(
  payload: Record<string, unknown>,
): InputValidation<RefactorOperationInput> {
  const payloadError = requireOnlyKeys(payload, ["target", "newName"], "operation.rename_symbol");
  if (payloadError) return invalid(payloadError);
  const target = parseTargetInput(payload.target, ["handle", "anchor"]);
  if (target.kind === "invalid-input") return target;
  const newName = requireString(payload.newName, "operation.rename_symbol.newName", {
    nonEmpty: true,
  });
  if (newName.kind === "invalid-input") return newName;
  return valid({
    rename_symbol: { target: target.value as RefactorTargetInput, newName: newName.value },
  });
}

/** Kind family each action operation accepts; `quickfix` and `notebook` kinds are never valid. */
const ACTION_KIND_FAMILY = { code_action: "refactor", source_action: "source" } as const;

function parseActionOperation(
  name: "code_action" | "source_action",
  payload: Record<string, unknown>,
): InputValidation<RefactorOperationInput> {
  const label = `operation.${name}`;
  const allowed =
    name === "code_action" ? ["file", "range", "kind", "title"] : ["file", "kind", "title"];
  const payloadError = requireOnlyKeys(payload, allowed, label);
  if (payloadError) return invalid(payloadError);
  const file = requireString(payload.file, `${label}.file`, { nonEmpty: true });
  if (file.kind === "invalid-input") return file;
  const kind = requireString(payload.kind, `${label}.kind`, { nonEmpty: true });
  if (kind.kind === "invalid-input") return kind;
  const family = ACTION_KIND_FAMILY[name];
  if (kind.value !== family && !kind.value.startsWith(`${family}.`)) {
    return invalid(`${label}.kind must be "${family}" or start with "${family}.".`);
  }
  const title =
    payload.title === undefined
      ? valid(undefined)
      : requireString(payload.title, `${label}.title`, { nonEmpty: true });
  if (title.kind === "invalid-input") return title;
  const selection = {
    file: file.value,
    kind: kind.value,
    ...(title.value === undefined ? {} : { title: title.value }),
  };
  if (name === "source_action") return valid({ source_action: selection });
  const range = parsePublicRange(payload.range, `${label}.range`);
  if (range.kind === "invalid-input") return range;
  return valid({ code_action: { ...selection, range: range.value } });
}

/** Parse a one-based range; an empty range (`start` equal to `end`) marks a cursor position. */
function parsePublicRange(value: unknown, label: string): InputValidation<PublicSourceRange> {
  const record = requireRecord(value, label);
  if (record.kind === "invalid-input") return record;
  const keysError = requireOnlyKeys(record.value, ["start", "end"], label);
  if (keysError) return invalid(keysError);
  const start = parsePosition(record.value.start, `${label}.start`);
  if (start.kind === "invalid-input") return start;
  const end = parsePosition(record.value.end, `${label}.end`);
  if (end.kind === "invalid-input") return end;
  if (
    end.value.line < start.value.line ||
    (end.value.line === start.value.line && end.value.character < start.value.character)
  ) {
    return invalid(`${label}.end must not be before ${label}.start.`);
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
