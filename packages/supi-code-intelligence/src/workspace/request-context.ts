/**
 * Compatibility shim — forwards to the canonical analysis request-context.
 *
 * This path was previously the deep runtime-access layer. The canonical
 * implementation is now in src/analysis/context/request-context.ts.
 * The @mrclrchtr/supi-code-runtime remains the shared capability broker.
 */

export type {
  AnalysisContext,
  CodeProvider,
  CodeProviderState,
} from "../analysis/context/request-context.ts";
/**
 * @deprecated Use buildAnalysisContext() or getCodeProviderState() instead.
 * This function is kept for backward compatibility.
 */
export {
  buildAnalysisContext,
  getCodeProviderState,
  getCodeProviderState as getCodeProvider,
} from "../analysis/context/request-context.ts";
