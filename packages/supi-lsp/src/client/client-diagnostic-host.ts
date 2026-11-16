import type { CFamilyFileAssociationResolver } from "@mrclrchtr/supi-code-runtime/api";
import type { DiagnosticRequestAdapter } from "./client-diagnostic-request.ts";
import type { NormalizedDocumentSync } from "./client-document-sync.ts";

/** Transport and capability operations required by diagnostic state. */
export interface ClientDiagnosticsHost {
  /** Configured server name, for debug-telemetry identity. */
  server: string;
  /** Absolute workspace root, for debug-telemetry identity. */
  cwd?: string;
  /** Immutable workspace association snapshot used for didOpen document IDs. */
  fileAssociations?: CFamilyFileAssociationResolver;
  isOperational(): boolean;
  /** Native pull and server-specific request evidence share this priority adapter. */
  diagnosticRequestAdapter: DiagnosticRequestAdapter;
  documentSync(): NormalizedDocumentSync;
  sendNotification(method: string, params: unknown): void;
  /**
   * Observe one tracked file whose state was cleared because it no longer exists.
   *
   * Every clear path reports here (passive prune, semantic input barrier, and
   * refresh resynchronization), so the owner can retain the removal until a
   * diagnostic report shows it.
   */
  onTrackedFileRemoved?(filePath: string): void;
}
