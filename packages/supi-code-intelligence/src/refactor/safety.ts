/**
 * Compatibility forwarder — delegates to canonical analysis/refactor/safety.ts.
 */

export type { ValidationResult } from "../analysis/refactor/safety.ts";
export { validateEdit, validateEditAgainstFiles } from "../analysis/refactor/safety.ts";
