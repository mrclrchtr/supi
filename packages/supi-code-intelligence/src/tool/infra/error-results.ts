/**
 * Compatibility export for code-intelligence error result assembly.
 *
 * Returned tool errors are assembled behind `src/tool/result/` with the rest
 * of public tool evidence. New tool code should import from
 * `../result/errors.ts` directly.
 */
export {
  contextErrorResult,
  healthErrorResult,
  inspectErrorResult,
  resolveErrorResult,
  searchErrorResult,
  unavailableContextDetails,
  unavailableHealthDetails,
  unavailableInspectDetails,
  unavailableResolveDetails,
  unavailableSearchDetails,
} from "../result/errors.ts";
