interface TrackingEntry {
  command: string;
  rewritten?: string;
  fallback: boolean;
}

let rewriteCount = 0;
let fallbackCount = 0;
let estimatedTokensSaved = 0;
const history: TrackingEntry[] = [];
const MAX_HISTORY = 10;

/** Estimated tokens saved per successful rewrite (conservative). */
const TOKENS_SAVED_PER_REWRITE = 200;

/** Record a successful rewrite for tracking. */
export function recordRewrite(command: string, rewritten: string): void {
  rewriteCount++;
  estimatedTokensSaved += TOKENS_SAVED_PER_REWRITE;
  history.push({ command, rewritten, fallback: false });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/** Record a fallback (non-rewritable or timed-out command). */
export function recordFallback(command: string): void {
  fallbackCount++;
  history.push({ command, fallback: true });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
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
  history.length = 0;
}
