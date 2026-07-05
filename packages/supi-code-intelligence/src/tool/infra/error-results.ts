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
  impactErrorResult,
  inspectErrorResult,
  resolveErrorResult,
  searchErrorResult,
  unavailableContextDetails,
  unavailableHealthDetails,
  unavailableImpactDetails,
  unavailableInspectDetails,
  unavailableResolveDetails,
  unavailableSearchDetails,
} from "../result/errors.ts";
