// Client-side diagnostic capability state — static (initialize result) and
// dynamic (client/registerCapability) tracking with fail-closed validation.
//
// Static state lives on the client's initialize-result capabilities; dynamic
// state lives in the per-instance `ClientDynamicRegistrations` below. Pull
// support is enabled only while the static provider shape is valid or the
// dynamic set for `textDocument/diagnostic` is non-empty.

import { posix as posixPath } from "node:path";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import { detectLanguageId } from "../utils.ts";

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
  return isValidDocumentSelector(value.documentSelector);
}

/** Test whether an optional LSP document selector has a valid shape. */
export function isValidDocumentSelector(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (typeof entry === "string") return entry.length > 0;
      if (!isRecord(entry)) return false;
      return (
        (entry.language === undefined || typeof entry.language === "string") &&
        (entry.scheme === undefined || typeof entry.scheme === "string") &&
        (entry.pattern === undefined || typeof entry.pattern === "string")
      );
    })
  );
}

/** Match one valid document selector against a file URI. */
export function isDocumentSelectorApplicable(selector: unknown, uri: string): boolean {
  if (selector === undefined || selector === null) return true;
  if (!isValidDocumentSelector(selector)) return false;
  if (!Array.isArray(selector) || selector.length === 0) return false;
  const language = detectLanguageId(uriToFile(uri));
  const scheme = readUriScheme(uri);
  const filePath = uriToFile(uri).replaceAll("\\", "/");
  return selector.some((entry) => {
    if (typeof entry === "string") return entry === language;
    if (!isRecord(entry)) return false;
    if (entry.language !== undefined && entry.language !== language) return false;
    if (entry.scheme !== undefined && entry.scheme !== scheme) return false;
    const pattern = entry.pattern;
    if (pattern === undefined) return true;
    if (typeof pattern !== "string") return false;
    const basename = filePath.slice(filePath.lastIndexOf("/") + 1);
    return globMatches(pattern, filePath) || globMatches(pattern, basename);
  });
}

function readUriScheme(uri: string): string | undefined {
  try {
    return new URL(uri).protocol.replace(/:$/, "");
  } catch {
    return undefined;
  }
}

function globMatches(pattern: string, value: string): boolean {
  try {
    return posixPath.matchesGlob(value, pattern);
  } catch {
    return false;
  }
}

/** One validated diagnostic registration retained for selector matching. */
export interface DiagnosticRegistration {
  readonly id: string;
  readonly options: Record<string, unknown>;
}

/**
 * Dynamic capability registrations for one client instance.
 *
 * A replacement client starts with an empty instance, so late registrations
 * on a superseded instance never affect the replacement. Unregistration
 * removes one id; pull stays enabled until the last id is removed.
 */
export class ClientDynamicRegistrations {
  private readonly registrationsByMethod = new Map<string, Map<string, Record<string, unknown>>>();

  /** Record one registration id for a method. Duplicate ids replace options. */
  register(method: string, id: string, options: Record<string, unknown> = {}): void {
    let registrations = this.registrationsByMethod.get(method);
    if (registrations === undefined) {
      registrations = new Map();
      this.registrationsByMethod.set(method, registrations);
    }
    registrations.set(id, options);
  }

  /** Remove one registration id; unknown ids are harmless no-ops. */
  unregister(method: string, id: string): void {
    this.registrationsByMethod.get(method)?.delete(id);
  }

  /** Whether any registration id remains active for a method. */
  has(method: string): boolean {
    return (this.registrationsByMethod.get(method)?.size ?? 0) > 0;
  }

  /** Return active registration options for one method. */
  get(method: string): readonly DiagnosticRegistration[] {
    return Array.from(this.registrationsByMethod.get(method) ?? [], ([id, options]) => ({
      id,
      options,
    }));
  }

  /** Drop all registrations — capability loss on shutdown, crash, or disposal. */
  clear(): void {
    this.registrationsByMethod.clear();
  }
}
