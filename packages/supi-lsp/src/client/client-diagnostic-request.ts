/** Sanitized ownership and transport control for one explicit diagnostic pull. */
export interface DiagnosticPullRequest {
  readonly uri: string;
  readonly previousResultId: string | undefined;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly operationId?: string;
}
