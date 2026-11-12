import { readFileSync } from "node:fs";
import * as path from "node:path";
import type {
  CodePosition,
  CodeRequestControl,
  DisambiguationCandidate,
  RefactorActionIdentity,
  RefactorResult,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { CodeActionTriggerKind } from "vscode-languageserver-types";
import { isCodeActionKindInRange, isCodeActionKindWithin } from "../config/operation-support.ts";
import type { CodeAction } from "../config/types.ts";
import { raceRequestControl } from "../session/readiness.ts";
import type { RoutedCodeActionResponse, WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  COMMAND_ONLY_ACTION_REASON,
  captureCommandAction,
  captureEligibleActions,
  commandCandidates,
  isCommandOnlyAction,
} from "./refactor-command-capture.ts";

export { COMMAND_ONLY_ACTION_REASON };

import {
  normalizeSemanticEdit,
  type SemanticEditNormalizationContext,
} from "./semantic-edit-normalizer.ts";

export async function runRenameRefactor(options: {
  lsp: WorkspaceLspRuntime;
  file: string;
  position: CodePosition;
  newName: string;
  control?: CodeRequestControl;
}): Promise<RefactorResult> {
  const { lsp, file, position, newName, control } = options;
  const response = control
    ? await lsp.rename(file, position, newName, control)
    : await lsp.rename(file, position, newName);
  if (!response) {
    return { kind: "unavailable", reason: "No routed LSP client could plan the rename." };
  }
  if (!response.value) {
    return {
      kind: "unavailable",
      reason: response.reason ?? "No routed LSP client could plan the rename.",
      authorizedMutationRoots: [...response.authorizedMutationRoots],
    };
  }
  return normalizeSemanticEdit(
    { kind: "workspace-edit", edit: response.value },
    {
      getOpenDocumentVersion: (candidate) => lsp.getOpenDocumentVersion(candidate),
      getSynchronizedDocumentSnapshot: (candidate) => {
        const snapshot = response.documentSnapshots?.find(
          (document) => path.resolve(document.file) === path.resolve(candidate),
        );
        return snapshot
          ? {
              version: snapshot.version,
              contentFingerprint: snapshot.contentFingerprint,
              diskContentFingerprint: snapshot.diskContentFingerprint,
            }
          : null;
      },
      authorizedMutationRoots: response.authorizedMutationRoots,
    },
  );
}

/**
 * Normalize code-action edits. Without document state, versioned changes fail closed.
 */
export function collectCodeActionResults(
  actions: CodeAction[],
  context: SemanticEditNormalizationContext,
): RefactorResult[] {
  const results: RefactorResult[] = [];
  for (const action of actions) {
    results.push(normalizeSemanticEdit({ kind: "code-action", action }, context));
  }
  return results;
}

/** Options for one code- or source-action planning request. */
export interface CodeActionRefactorOptions {
  lsp: WorkspaceLspRuntime;
  file: string;
  range: SourceRange;
  kind: string;
  title?: string;
  /** Operation label used in unavailable reasons. */
  label: "Code action" | "Source action";
  control?: CodeRequestControl;
}

/**
 * Plan one code action of the requested kind over a file range.
 *
 * `kind` matches itself and its dotted sub-kinds, per the LSP CodeActionKind
 * hierarchy. Disabled actions never match. `title` narrows matches to one exact
 * title. Distinct precise plans stay ambiguous. One eligible command-only
 * action runs once so its pushed edit can be captured; see
 * `refactor-command-capture.ts`.
 */
export async function runCodeActionRefactor(
  options: CodeActionRefactorOptions,
): Promise<RefactorResult> {
  return (await attemptCodeActionRefactor(options)).result;
}

/** Delays before re-requesting a source action that returned no action of the kind. */
const SOURCE_ACTION_RETRY_DELAYS_MS = [500, 1000] as const;

/**
 * Plan a whole-file source action, retrying briefly when a server that
 * advertises the requested kind returns no action of it.
 *
 * typescript-language-server returns no fix-all or unused-code source actions
 * while diagnostics for a just-opened or just-changed file are pending, and
 * waits itself about 500 ms in the equivalent quick-fix path.
 */
export async function runSourceActionRefactor(
  options: CodeActionRefactorOptions,
): Promise<RefactorResult> {
  let attempt = await attemptCodeActionRefactor(options);
  for (const delayMs of SOURCE_ACTION_RETRY_DELAYS_MS) {
    if (!attempt.retryable) break;
    await raceRequestControl(
      new Promise((resolve) => setTimeout(resolve, delayMs)),
      options.control,
    );
    attempt = await attemptCodeActionRefactor(options);
  }
  return attempt.result;
}

/**
 * One planning attempt. `retryable` marks a zero-match response from a server
 * that advertises the requested kind, so a later request may still return it.
 */
async function attemptCodeActionRefactor(
  options: CodeActionRefactorOptions,
): Promise<{ result: RefactorResult; retryable: boolean }> {
  const { lsp, file, range, kind, title, label } = options;
  const response = await lsp.codeActions(file, range, options.control, {
    only: [kind],
    triggerKind: CodeActionTriggerKind.Invoked,
  });
  if (!response) {
    return {
      result: {
        kind: "unavailable",
        reason: `${label} "${kind}" is unavailable: no routed LSP client.`,
      },
      retryable: false,
    };
  }
  const roots = [...response.authorizedMutationRoots];
  const unavailable = (reason: string, retryable = false) => ({
    result: { kind: "unavailable" as const, reason, authorizedMutationRoots: roots },
    retryable,
  });
  if (response.reason || !response.value) {
    return unavailable(
      `${label} "${kind}" is unavailable: ${response.reason ?? "no code actions were returned."}`,
    );
  }

  const ofKind = response.value
    .filter(isTitledCodeAction)
    .filter(
      (action) => isCodeActionKindWithin(action.kind, kind) && !Object.hasOwn(action, "disabled"),
    );
  if (ofKind.length === 0) {
    const advertised = advertisedFamilyKinds(response.advertisedKinds, kind);
    return unavailable(
      noKindMatchReason(kind, advertised),
      advertised.kinds.some((candidate) => isCodeActionKindInRange(candidate, kind)),
    );
  }
  const matching = title === undefined ? ofKind : ofKind.filter((action) => action.title === title);
  if (matching.length === 0) {
    const titles = [...new Set(ofKind.map((action) => `"${action.title}"`))].join(", ");
    return unavailable(
      `No "${kind}" code action has the title "${title}". Available titles: ${titles}.`,
    );
  }

  return { result: await planMatchingActions(options, matching, response), retryable: false };
}

/** Turn the matching actions into one plan, candidates, or an unavailable reason. */
async function planMatchingActions(
  options: CodeActionRefactorOptions,
  matching: CodeAction[],
  response: RoutedCodeActionResponse,
): Promise<RefactorResult> {
  const { lsp, file, kind } = options;
  const roots = [...response.authorizedMutationRoots];
  const unavailable = (reason: string): RefactorResult => ({
    kind: "unavailable",
    reason,
    authorizedMutationRoots: roots,
  });
  const plans = collectPrecisePlans(matching, {
    getOpenDocumentVersion: (candidate) => lsp.getOpenDocumentVersion(candidate),
    authorizedMutationRoots: response.authorizedMutationRoots,
  });
  const [single] = plans.precise;
  if (plans.precise.length === 1 && single) {
    return { ...single.result, action: { ...actionIdentity(single.action), provenance: "edit" } };
  }
  if (plans.precise.length > 1) {
    return {
      kind: "ambiguous",
      candidates: plans.precise.map(({ action, result }, index) =>
        refactorCandidate(action, result, index, plans.precise),
      ),
    };
  }
  if (matching.every(isCommandOnlyAction)) {
    const eligible = captureEligibleActions(matching, response.advertisedCommands);
    const [only] = eligible;
    if (eligible.length === 1 && only) {
      return captureCommandAction({ lsp, file, action: only, control: options.control });
    }
    return eligible.length > 1
      ? commandCandidates(eligible)
      : unavailable(COMMAND_ONLY_ACTION_REASON);
  }
  return unavailable(
    plans.unavailableReason
      ? `Matching code action is unavailable: ${plans.unavailableReason}`
      : `Matching "${kind}" code actions did not produce precise edits.`,
  );
}

/** Compute the zero-based UTF-16 range that covers a file's full current disk text. */
export function wholeDocumentRange(file: string): SourceRange | null {
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const lines = text.split(/\r\n|\r|\n/);
  return {
    start: { line: 0, character: 0 },
    end: { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 },
  };
}

function isTitledCodeAction(value: unknown): value is CodeAction {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

/** Advertised kinds in one CodeActionKind family, such as `source*`. */
interface AdvertisedFamilyKinds {
  /** Listed non-empty kinds in the requested kind's top-level family. */
  readonly kinds: readonly string[];
  /** The server lists CodeActionKind.Empty or no kinds, so it may return any kind. */
  readonly anyKind: boolean;
}

function advertisedFamilyKinds(
  advertised: readonly string[] | undefined,
  kind: string,
): AdvertisedFamilyKinds {
  const family = kind.split(".")[0] ?? kind;
  return {
    kinds: (advertised ?? []).filter(
      (candidate) => candidate !== "" && isCodeActionKindWithin(candidate, family),
    ),
    anyKind: !advertised || advertised.includes(""),
  };
}

function noKindMatchReason(kind: string, advertised: AdvertisedFamilyKinds): string {
  const parts = [`No code action matches kind "${kind}" here.`];
  if (advertised.kinds.length > 0) {
    parts.push(`Server-advertised kinds: ${advertised.kinds.join(", ")}.`);
  }
  if (advertised.anyKind) {
    parts.push("The server may return any code-action kind but returned none of this kind.");
  } else if (advertised.kinds.length === 0) {
    parts.push("The server advertises no kinds in this family.");
  }
  return parts.join(" ");
}

function actionIdentity(action: CodeAction): RefactorActionIdentity {
  return { kind: typeof action.kind === "string" ? action.kind : "", title: action.title };
}

interface PreciseCodeActionPlan {
  action: CodeAction;
  result: Extract<RefactorResult, { kind: "precise" }>;
}

function collectPrecisePlans(
  actions: readonly CodeAction[],
  context: SemanticEditNormalizationContext,
): { precise: PreciseCodeActionPlan[]; unavailableReason: string | null } {
  const precise: PreciseCodeActionPlan[] = [];
  const planKeys = new Set<string>();
  let unavailableReason: string | null = null;
  for (const action of actions) {
    const converted = normalizeSemanticEdit({ kind: "code-action", action }, context);
    if (converted.kind === "precise") {
      const key = normalizedPlanKey(converted);
      if (!planKeys.has(key)) {
        planKeys.add(key);
        precise.push({ action, result: converted });
      }
      continue;
    }
    if (converted.kind === "unavailable") unavailableReason ??= converted.reason;
  }
  return { precise, unavailableReason };
}

function normalizedPlanKey(result: Extract<RefactorResult, { kind: "precise" }>): string {
  const edits = result.edits.edits
    .map((edit) => ({
      file: edit.file,
      start: edit.range.start,
      end: edit.range.end,
      newText: edit.newText,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const preconditions = [...(result.edits.documentPreconditions ?? [])].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  return JSON.stringify({ edits, preconditions });
}

function refactorCandidate(
  action: CodeAction,
  result: Extract<RefactorResult, { kind: "precise" }>,
  index: number,
  plans: readonly { action: CodeAction }[],
): DisambiguationCandidate {
  const firstEdit = result.edits.edits[0];
  const sameTitleCount = plans.filter((plan) => plan.action.title === action.title).length;
  const description =
    sameTitleCount > 1 ? `${action.title} (alternative ${index + 1})` : action.title;
  return {
    description,
    ...actionIdentity(action),
    ...(firstEdit
      ? {
          file: firstEdit.file,
          line: firstEdit.range.start.line + 1,
          character: firstEdit.range.start.character + 1,
        }
      : {}),
  };
}
