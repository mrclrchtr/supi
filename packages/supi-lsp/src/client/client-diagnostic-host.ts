import type { DocumentDiagnosticReport } from "../config/types.ts";
import type { DiagnosticPullRequest } from "./client-diagnostic-request.ts";

/** Transport and capability operations required by diagnostic state. */
export interface ClientDiagnosticsHost {
  isOperational(): boolean;
  supportsPullDiagnostics(): boolean;
  sendNotification(method: string, params: unknown): void;
  pullDocumentDiagnostics(request: DiagnosticPullRequest): Promise<DocumentDiagnosticReport | null>;
}
