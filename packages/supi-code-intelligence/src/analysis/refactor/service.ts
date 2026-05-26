/**
 * Refactor analysis service — semantic rename operations.
 *
 * Delegates to the existing code_refactor orchestration.
 */

import { executeRefactorTool } from "../../tool/execute-refactor.ts";
import type { CodeIntelResult } from "../../types.ts";

export interface RefactorServiceInput {
  operation: string;
  file: string;
  line: number;
  character: number;
  newName: string;
  cwd: string;
}

/**
 * Execute a semantic refactor operation.
 */
export async function executeRefactorService(
  input: RefactorServiceInput,
): Promise<CodeIntelResult> {
  if (input.operation === "rename") {
    return executeRefactorTool(
      {
        operation: input.operation,
        file: input.file,
        line: input.line,
        character: input.character,
        newName: input.newName,
      },
      { cwd: input.cwd },
    );
  }

  return {
    content: `Unsupported refactor operation: "${input.operation}"`,
    details: undefined,
  };
}
