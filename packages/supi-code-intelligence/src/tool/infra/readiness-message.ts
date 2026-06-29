/** Render user-facing semantic readiness messages for tool executors. */
export function renderSemanticReadinessTimeout(toolName: string, timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `**Error:** Semantic analysis for \`${toolName}\` is still warming for this workspace (LSP indexing/startup not finished after ${seconds}s). Try again shortly or check \`code_health\`.`;
}
