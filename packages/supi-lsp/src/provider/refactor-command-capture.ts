/**
 * Plan command-only code actions by capturing the edit their command pushes.
 *
 * Only `refactor*`, `source.organizeImports*`, and `source.fixAll*` commands
 * may run, and only when the server lists the command (if it lists any). Other
 * source commands can have side effects outside the editor, so they never run.
 * Several eligible actions stay ambiguous without running any command.
 */

import type {
  CodeRequestControl,
  DisambiguationCandidate,
  DocumentEditPrecondition,
  RefactorResult,
} from "@mrclrchtr/supi-code-runtime/api";
import { isCodeActionKindWithin } from "../config/operation-support.ts";
import type { CodeAction, Command } from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import { normalizeSemanticEdit } from "./semantic-edit-normalizer.ts";

const CAPTURE_ELIGIBLE_KINDS = ["refactor", "source.organizeImports", "source.fixAll"] as const;

/** A code action whose only effect is a server command. */
export type CommandOnlyAction = CodeAction & { command: Command; kind: string };

/** Whether a code action has a command and no edit. */
export function isCommandOnlyAction(action: CodeAction): boolean {
  return Object.hasOwn(action, "command") && !action.edit;
}

/**
 * Select the command-only actions SuPi may run to capture an edit: an eligible
 * kind, and a command the server lists when it lists any.
 */
export function captureEligibleActions(
  actions: readonly CodeAction[],
  advertisedCommands: readonly string[] | undefined,
): CommandOnlyAction[] {
  return actions.filter((action): action is CommandOnlyAction => {
    const command = action.command;
    return (
      isCommandOnlyAction(action) &&
      typeof action.kind === "string" &&
      typeof command?.command === "string" &&
      CAPTURE_ELIGIBLE_KINDS.some((kind) => isCodeActionKindWithin(action.kind, kind)) &&
      (advertisedCommands === undefined || advertisedCommands.includes(command.command))
    );
  });
}

/** Candidates for several eligible command-only actions; no command has run. */
export function commandCandidates(actions: readonly CommandOnlyAction[]): RefactorResult {
  return {
    kind: "ambiguous",
    candidates: actions.map(
      (action): DisambiguationCandidate => ({
        description: action.title,
        kind: action.kind,
        title: action.title,
      }),
    ),
  };
}

/**
 * Run one action's command, capture its single pushed edit, and normalize it
 * like a direct edit. Versioned preconditions move to the resynced versions,
 * which hold the same content.
 */
export async function captureCommandAction(options: {
  lsp: WorkspaceLspRuntime;
  file: string;
  action: CommandOnlyAction;
  control?: CodeRequestControl;
}): Promise<RefactorResult> {
  const { lsp, file, action, control } = options;
  const response = await lsp.captureCommandEdits(file, action.command, control);
  if (!response) {
    return { kind: "unavailable", reason: "No routed LSP client could run the command." };
  }
  const roots = [...response.authorizedMutationRoots];
  const capture = response.value;
  if (!capture || capture.kind === "unavailable") {
    return {
      kind: "unavailable",
      reason: `Command for "${action.title}" is unavailable: ${capture?.reason ?? response.reason ?? "no result."}`,
      authorizedMutationRoots: roots,
    };
  }

  const before = new Map(capture.resynced.map((entry) => [entry.file, entry]));
  const result = normalizeSemanticEdit(
    { kind: "workspace-edit", edit: capture.edit },
    {
      // Captured edits target the versions from before the resync.
      getOpenDocumentVersion: (candidate) => {
        const current = lsp.getOpenDocumentVersion(candidate);
        const versions = before.get(candidate);
        return versions && current === versions.to ? versions.from : current;
      },
      authorizedMutationRoots: response.authorizedMutationRoots,
    },
  );
  if (result.kind !== "precise") {
    return result.kind === "unavailable"
      ? {
          kind: "unavailable",
          reason: `Captured edit for "${action.title}" could not produce precise edits: ${result.reason}`,
          authorizedMutationRoots: roots,
        }
      : result;
  }
  const preconditions = result.edits.documentPreconditions?.map((precondition) =>
    rebase(precondition, before),
  );
  return {
    ...result,
    edits: { ...result.edits, ...(preconditions ? { documentPreconditions: preconditions } : {}) },
    action: { kind: action.kind, title: action.title, provenance: "captured-command" },
  };
}

function rebase(
  precondition: DocumentEditPrecondition,
  resynced: ReadonlyMap<string, { from: number; to: number }>,
): DocumentEditPrecondition {
  if (precondition.kind === "disk-content") return precondition;
  const versions = resynced.get(precondition.file);
  return versions && precondition.version === versions.from
    ? { ...precondition, version: versions.to }
    : precondition;
}
