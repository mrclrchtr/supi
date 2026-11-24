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
  /**
   * Size of the workspace-root instruction file, the only one embedded in every Reviewer Packet.
   * A larger file fails the Review before fan-out instead of being embedded partially.
   */
  instructionFileBytes: 100_000,
  criteriaCoverageReasonCharacters: 500,
  recoveryDeclineReasonCharacters: 2_000,
  reviewScopePathsPerTarget: 16,
  reviewScopePathCharacters: 4_096,
} as const;
