// ── Delegation Task input bounds ──────────────────────────────────

/** Maximum tasks in one Delegation Batch. */
export const MAX_TASKS = 4;
/** Maximum length of a task identifier. */
export const MAX_TASK_ID_LENGTH = 64;
/** Maximum instructions text length per task. */
export const MAX_INSTRUCTIONS_CHARS = 32_000;
/** Maximum shared context text length. */
export const MAX_SHARED_CONTEXT_CHARS = 16_000;

// ── Output lane bounds ───────────────────────────────────────────

/** Per-task characters visible to the parent model. */
export const MODEL_LANE_MAX_CHARS = 16_000;
/** Per-task characters visible to humans (expanded details). */
export const HUMAN_LANE_MAX_CHARS = 51_200; // 50 KB

// ── Conversation View bounds ─────────────────────────────────────

/** Maximum visible conversation entries per Agent Run. */
export const MAX_CONVERSATION_ENTRIES = 100;
/** Maximum visible text bytes (characters) per Agent Run conversation view. */
export const MAX_CONVERSATION_TEXT_CHARS = 51_200;
/** Maximum characters in a redacted bash first-line preview. */
export const MAX_BASH_PREVIEW_CHARS = 120;
