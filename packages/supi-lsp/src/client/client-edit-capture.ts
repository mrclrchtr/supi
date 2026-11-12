/**
 * Capture window for server-pushed `workspace/applyEdit` requests.
 *
 * SuPi never applies an edit that a server pushes. While one command runs for
 * preview, each pushed edit is recorded and refused; outside that window every
 * pushed edit is refused as unsolicited (LSP 3.17 `ApplyWorkspaceEditResult`).
 */

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type { Command, WorkspaceEdit } from "../config/types.ts";
import { LSP_REQUEST_TIMEOUT_ERROR_CODE } from "../debug-telemetry.ts";

/** Reply for an edit recorded for preview. */
export const CAPTURED_EDIT_REPLY = {
  applied: false,
  failureReason: "SuPi captured this edit for preview.",
} as const;

/** Reply for an edit that arrives outside a capture window. */
export const UNSOLICITED_EDIT_REPLY = {
  applied: false,
  failureReason: "SuPi does not accept unsolicited workspace edits.",
} as const;

/** Result of running one command inside a capture window. */
export type CommandEditCaptureResult =
  | {
      readonly kind: "captured";
      /** The single edit the server pushed while the command ran. */
      readonly edit: WorkspaceEdit;
      /** Open documents re-sent afterwards, with their versions before and after. */
      readonly resynced: readonly { file: string; from: number; to: number }[];
    }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Records pushed edits for at most one open capture window per client. */
export class EditCaptureWindow {
  #edits: unknown[] | null = null;

  /** Whether a capture window is open. */
  get isOpen(): boolean {
    return this.#edits !== null;
  }

  /** Open the window. Returns false when one is already open. */
  open(): boolean {
    if (this.#edits) return false;
    this.#edits = [];
    return true;
  }

  /** Close the window and return the edits pushed while it was open. */
  close(): unknown[] {
    const edits = this.#edits ?? [];
    this.#edits = null;
    return edits;
  }

  /** Answer one `workspace/applyEdit` request; the edit is never applied. */
  handleApplyEdit(params: unknown): typeof CAPTURED_EDIT_REPLY | typeof UNSOLICITED_EDIT_REPLY {
    if (!this.#edits) return UNSOLICITED_EDIT_REPLY;
    const edit =
      typeof params === "object" && params !== null
        ? (params as { edit?: unknown }).edit
        : undefined;
    this.#edits.push(edit);
    return CAPTURED_EDIT_REPLY;
  }
}

/** Collect the file URIs a captured edit touches, for resynchronization. */
export function editedDocumentUris(edit: unknown): string[] {
  if (typeof edit !== "object" || edit === null) return [];
  const uris = new Set<string>();
  const { changes, documentChanges } = edit as {
    changes?: unknown;
    documentChanges?: unknown;
  };
  if (typeof changes === "object" && changes !== null) {
    for (const uri of Object.keys(changes)) uris.add(uri);
  }
  if (Array.isArray(documentChanges)) {
    for (const change of documentChanges) {
      const uri = (change as { textDocument?: { uri?: unknown } } | null)?.textDocument?.uri;
      if (typeof uri === "string") uris.add(uri);
    }
  }
  return [...uris];
}

/** Collaborators for one command capture on one client. */
export interface CommandEditCaptureOptions {
  readonly command: Command;
  /** Upper bound for the command to finish. */
  readonly timeoutMs: number;
  readonly control?: CodeRequestControl;
  readonly window: EditCaptureWindow;
  sendRequest(
    method: string,
    params: unknown,
    options: { timeoutMs: number } & CodeRequestControl,
  ): Promise<unknown>;
  /** Re-send one open document; null when it is not open. */
  resynchronize(file: string): { from: number; to: number } | null;
}

/**
 * Run one command inside a capture window. Exactly one pushed edit becomes the
 * result; none, several, or a timeout are unavailable. Cancellation propagates.
 * The window always closes, and every touched open document is resynced.
 */
export async function runCommandEditCapture(
  options: CommandEditCaptureOptions,
): Promise<CommandEditCaptureResult> {
  const { command, timeoutMs, control, window } = options;
  if (!window.open()) {
    return {
      kind: "unavailable",
      reason: "Another server command capture is running on this client; retry shortly.",
    };
  }
  let edits: unknown[] = [];
  let timedOut = false;
  try {
    await options.sendRequest(
      "workspace/executeCommand",
      { command: command.command, ...(command.arguments ? { arguments: command.arguments } : {}) },
      { ...control, timeoutMs },
    );
  } catch (error) {
    if (control?.signal?.aborted || !isTimeout(error)) {
      edits = window.close();
      resynchronizeEdits(edits, options.resynchronize);
      throw error;
    }
    timedOut = true;
  }
  edits = window.close();
  const resynced = resynchronizeEdits(edits, options.resynchronize);
  if (timedOut) {
    return {
      kind: "unavailable",
      reason: `The server command did not finish within ${timeoutMs} ms.`,
    };
  }
  if (edits.length === 0) {
    return { kind: "unavailable", reason: "The server command produced no edit." };
  }
  if (edits.length > 1) {
    return {
      kind: "unavailable",
      reason: `The server command produced ${edits.length} edits; only one can be previewed.`,
    };
  }
  return { kind: "captured", edit: edits[0] as WorkspaceEdit, resynced };
}

function resynchronizeEdits(
  edits: readonly unknown[],
  resynchronize: CommandEditCaptureOptions["resynchronize"],
): { file: string; from: number; to: number }[] {
  const uris = new Set(edits.flatMap((edit) => editedDocumentUris(edit)));
  const resynced: { file: string; from: number; to: number }[] = [];
  for (const uri of uris) {
    let file: string;
    try {
      file = uriToFile(uri);
    } catch {
      continue;
    }
    const versions = resynchronize(file);
    if (versions) resynced.push({ file, ...versions });
  }
  return resynced;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === LSP_REQUEST_TIMEOUT_ERROR_CODE
  );
}
