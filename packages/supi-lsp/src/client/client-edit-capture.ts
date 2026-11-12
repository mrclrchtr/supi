/**
 * Capture window for server-pushed `workspace/applyEdit` requests.
 *
 * SuPi never applies an edit that a server pushes. While one command runs for
 * preview, each pushed edit is recorded and refused; outside that window every
 * pushed edit is refused as unsolicited (LSP 3.17 `ApplyWorkspaceEditResult`).
 */

import {
  type CodeRequestControl,
  isCodeRequestInterruption,
} from "@mrclrchtr/supi-code-runtime/api";
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

/** Reply for an edit from a command SuPi stopped waiting for. */
export const ABANDONED_EDIT_REPLY = {
  applied: false,
  failureReason: "SuPi stopped waiting for the command that produced this edit.",
} as const;

/**
 * Records pushed edits for at most one capture per client. After a capture
 * stops waiting (timeout, abort, deadline) the window keeps draining until the
 * abandoned command settles, so its late edits are refused and can never be
 * attributed to the next capture.
 */
export class EditCaptureWindow {
  #state: "idle" | "capturing" | "draining" = "idle";
  #edits: unknown[] = [];
  #onEdit: (() => void) | undefined;

  /** Open the window. Returns false while another capture runs or drains. */
  open(): boolean {
    if (this.#state !== "idle") return false;
    this.#state = "capturing";
    this.#edits = [];
    return true;
  }

  /** Stop capturing and return the edits pushed so far. */
  close(): unknown[] {
    const edits = this.#edits;
    this.#edits = [];
    this.#onEdit = undefined;
    if (this.#state === "capturing") this.#state = "idle";
    return edits;
  }

  /** Stop capturing but refuse new captures until `settled` resolves. */
  drain(settled: Promise<void>): unknown[] {
    const edits = this.close();
    this.#state = "draining";
    void settled.then(() => {
      if (this.#state === "draining") this.#state = "idle";
    });
    return edits;
  }

  /** Wait up to `ms` for the first edit when none has arrived yet. */
  async waitForEdit(ms: number): Promise<void> {
    if (this.#edits.length > 0 || ms <= 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.#onEdit = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  /** Answer one `workspace/applyEdit` request; the edit is never applied. */
  handleApplyEdit(
    params: unknown,
  ): typeof CAPTURED_EDIT_REPLY | typeof UNSOLICITED_EDIT_REPLY | typeof ABANDONED_EDIT_REPLY {
    if (this.#state === "draining") return ABANDONED_EDIT_REPLY;
    if (this.#state === "idle") return UNSOLICITED_EDIT_REPLY;
    const edit =
      typeof params === "object" && params !== null
        ? (params as { edit?: unknown }).edit
        : undefined;
    this.#edits.push(edit);
    this.#onEdit?.();
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

/** Default wait for an edit a server pushes just after answering the command. */
const DEFAULT_GRACE_MS = 250;

/** Collaborators for one command capture on one client. */
export interface CommandEditCaptureOptions {
  readonly command: Command;
  /** Upper bound for the command to finish. */
  readonly timeoutMs: number;
  /** Wait for an edit pushed after the command answers; LSP allows that order. */
  readonly graceMs?: number;
  /** Upper bound for refusing late edits from an abandoned command. */
  readonly drainMs?: number;
  readonly control?: CodeRequestControl;
  readonly window: EditCaptureWindow;
  /** Send one request and expose when its transport lifetime ends. */
  sendRequestOwned(
    method: string,
    params: unknown,
    options: { timeoutMs: number } & CodeRequestControl,
  ): { result: Promise<unknown>; settled: Promise<void> };
  /** Re-send one open document; null when it is not open. */
  resynchronize(file: string): { from: number; to: number } | null;
}

/**
 * Run one command inside a capture window. Exactly one pushed edit becomes the
 * result; none, several, a timeout, or a server error are unavailable.
 * Cancellation and deadline expiry propagate. Every touched open document is
 * resynced, and an abandoned command keeps the window draining.
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
  const request = options.sendRequestOwned(
    "workspace/executeCommand",
    { command: command.command, ...(command.arguments ? { arguments: command.arguments } : {}) },
    { ...control, timeoutMs },
  );
  try {
    await request.result;
  } catch (error) {
    return abandonCapture(options, request.settled, error);
  }
  await window.waitForEdit(options.graceMs ?? DEFAULT_GRACE_MS);
  const edits = window.close();
  const resynced = resynchronizeEdits(edits, options.resynchronize);
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

/** Close or drain the window after the command failed, then report or rethrow. */
function abandonCapture(
  options: CommandEditCaptureOptions,
  settled: Promise<void>,
  error: unknown,
): CommandEditCaptureResult {
  const { window, timeoutMs, control } = options;
  const drainMs = options.drainMs ?? timeoutMs;
  const edits = drainMs > 0 ? window.drain(boundedSettle(settled, drainMs)) : window.close();
  resynchronizeEdits(edits, options.resynchronize);
  if (isCodeRequestInterruption(error, control)) throw error;
  return {
    kind: "unavailable",
    reason: isTimeout(error)
      ? `The server command did not finish within ${timeoutMs} ms.`
      : `The server command failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

function boundedSettle(settled: Promise<void>, ms: number): Promise<void> {
  return Promise.race([settled, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
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
