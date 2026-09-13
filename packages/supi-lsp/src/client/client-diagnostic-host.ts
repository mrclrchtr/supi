import type { DiagnosticRequestAdapter } from "./client-diagnostic-request.ts";

/** Transport and capability operations required by diagnostic state. */
export interface ClientDiagnosticsHost {
  /** Configured server name, for debug-telemetry identity. */
  server: string;
  /** Absolute workspace root, for debug-telemetry identity. */
  cwd?: string;
  isOperational(): boolean;
  /** Native pull and server-specific request evidence share this priority adapter. */
  diagnosticRequestAdapter: DiagnosticRequestAdapter;
  usesIncrementalDocumentSync(): boolean;
  sendNotification(method: string, params: unknown): void;
}
