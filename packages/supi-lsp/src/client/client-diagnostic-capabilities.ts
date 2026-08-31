// Client-side diagnostic capability state — static (initialize result) and
// dynamic (client/registerCapability) tracking with fail-closed validation.
//
// Static state lives on the client's initialize-result capabilities; dynamic
// state lives in the per-instance `ClientDynamicRegistrations` below. Pull
// support is enabled only while the static provider shape is valid or the
// dynamic set for `textDocument/diagnostic` is non-empty.

/** LSP method for document diagnostic pulls. */
export const DOCUMENT_DIAGNOSTIC_METHOD = "textDocument/diagnostic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate one untrusted `DiagnosticOptions` / `DiagnosticRegistrationOptions`
 * value from a static initialize result or a dynamic registration.
 *
 * Required per the LSP specification: boolean `interFileDependencies` and
 * `workspaceDiagnostics`. Optional: string `identifier`, and `documentSelector`
 * (absent, null, or an array of string selectors / document-filter records).
 * Unknown fields such as kotlin-lsp's `workDoneProgress` are tolerated.
 */
export function isValidDiagnosticOptions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.interFileDependencies !== "boolean") return false;
  if (typeof value.workspaceDiagnostics !== "boolean") return false;
  if (value.identifier !== undefined && typeof value.identifier !== "string") return false;
  if (value.documentSelector !== undefined && value.documentSelector !== null) {
    if (!Array.isArray(value.documentSelector)) return false;
    if (!value.documentSelector.every((entry) => typeof entry === "string" || isRecord(entry))) {
      return false;
    }
  }
  return true;
}

/**
 * Dynamic capability registrations for one client instance.
 *
 * A replacement client starts with an empty instance, so late registrations
 * on a superseded instance never affect the replacement. Unregistration
 * removes one id; pull stays enabled until the last id is removed.
 */
export class ClientDynamicRegistrations {
  private readonly idsByMethod = new Map<string, Set<string>>();

  /** Record one registration id for a method. Duplicate ids are harmless. */
  register(method: string, id: string): void {
    let ids = this.idsByMethod.get(method);
    if (ids === undefined) {
      ids = new Set();
      this.idsByMethod.set(method, ids);
    }
    ids.add(id);
  }

  /** Remove one registration id; unknown ids are harmless no-ops. */
  unregister(method: string, id: string): void {
    this.idsByMethod.get(method)?.delete(id);
  }

  /** Whether any registration id remains active for a method. */
  has(method: string): boolean {
    return (this.idsByMethod.get(method)?.size ?? 0) > 0;
  }

  /** Drop all registrations — capability loss on shutdown, crash, or disposal. */
  clear(): void {
    this.idsByMethod.clear();
  }
}
