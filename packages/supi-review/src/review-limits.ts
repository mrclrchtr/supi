/** Centralized provider and runtime bounds for persisted review input/output. */
export const REVIEW_LIMITS = {
  taskIdCharacters: 64,
  sharedContextCharacters: 16_000,
  taskInstructionCharacters: 16_000,
  summaryCharacters: 8_000,
  findingsPerTask: 20,
  findingTitleCharacters: 200,
  findingDescriptionCharacters: 8_000,
  locationPathCharacters: 4_096,
  searchQueryCharacters: 4_096,
} as const;
