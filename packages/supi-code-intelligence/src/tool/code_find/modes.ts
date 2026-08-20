/** Canonical public code_find mode vocabulary. */
export const CODE_FIND_MODES = ["ast", "semantic"] as const;

/** One supported code-aware search mode. */
export type CodeFindMode = (typeof CODE_FIND_MODES)[number];
