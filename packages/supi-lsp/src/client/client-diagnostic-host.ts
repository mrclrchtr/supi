import type { DocumentDiagnosticReport } from "../config/types.ts";

/** Transport and capability operations required by diagnostic state. */
export interface ClientDiagnosticsHost {
  isOperational(): boolean;
  supportsPullDiagnostics(): boolean;
  sendNotification(method: string, params: unknown): void;
  pullDocumentDiagnostics(
    uri: string,
    previousResultId: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<DocumentDiagnosticReport | null>;
}
