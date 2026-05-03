let rewriteCount = 0;
let fallbackCount = 0;
let estimatedTokensSaved = 0;

/** Estimated tokens saved per successful rewrite (conservative). */
const TOKENS_SAVED_PER_REWRITE = 200;

/** Record a successful rewrite for tracking. */
export function recordRewrite(_command: string, _rewritten: string): void {
  rewriteCount++;
  estimatedTokensSaved += TOKENS_SAVED_PER_REWRITE;
}

/** Record a fallback (non-rewritable or timed-out command). */
export function recordFallback(_command: string): void {
  fallbackCount++;
}

/** Get current session statistics, or null if no activity yet. */
export function getStats(): Record<string, string | number> | null {
  if (rewriteCount === 0 && fallbackCount === 0) {
    return null;
  }
  return {
    rewrites: rewriteCount,
    fallbacks: fallbackCount,
    estimatedTokensSaved,
  };
}

/** Reset all tracking state (called on session_start). */
export function resetTracking(): void {
  rewriteCount = 0;
  fallbackCount = 0;
  estimatedTokensSaved = 0;
}
