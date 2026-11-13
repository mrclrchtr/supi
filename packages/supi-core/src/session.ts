// supi-core session domain — session utilities and registries.

export type {
  ChildWebToolName,
  ChildWebToolProvision,
  ChildWebToolsRequestContext,
} from "./child-web-tools.ts";
export {
  CHILD_WEB_TOOL_NAMES,
  callableChildWebToolNames,
  provideChildWebTools,
  requestChildWebTools,
} from "./child-web-tools.ts";
export { createRegistry, createSessionStateRegistry } from "./registry-utils.ts";
export type {
  SessionCapabilitySkill,
  SessionCapabilitySkillProvider,
  SessionCapabilityState,
} from "./session-capabilities.ts";
export {
  applySessionCapabilityProfile,
  captureSessionCapabilityExclusions,
  clearPendingSessionCapabilityForks,
  createEmptySessionCapabilityState,
  decodeSessionCapabilities,
  findSessionCapabilities,
  getSessionCapabilitySkillProvider,
  isSessionCapabilityProfileModified,
  readPendingSessionCapabilityFork,
  registerSessionCapabilitySkillProvider,
  SESSION_CAPABILITIES_ENTRY,
  sessionCapabilityState,
  setPendingSessionCapabilityFork,
} from "./session-capabilities.ts";
export type {
  ResolveSessionCapabilityProfilesOptions,
  SessionCapabilityProfile,
  SessionCapabilityProfileDefault,
  SessionCapabilityProfileDefinition,
  SessionCapabilityProfileDiagnostic,
  SessionCapabilityProfileEntry,
  SessionCapabilityProfileScope,
  SessionCapabilityProfileSnapshot,
  SessionCapabilityProfilesResolution,
  SessionCapabilityProfilesSection,
  SessionCapabilityProfileValidation,
} from "./session-capability-profiles.ts";
export {
  decodeSessionCapabilityProfileSnapshot,
  isSessionCapabilityProfileId,
  resolveSessionCapabilityProfiles,
  validateSessionCapabilityProfile,
} from "./session-capability-profiles.ts";
export type { SessionNameTrackerHost } from "./session-utils.ts";
export {
  createSessionNameTracker,
  getActiveBranchEntries,
} from "./session-utils.ts";
export { BSD_SED_HINT, BSD_SED_HINT_MARKER, registerShellHints } from "./shell-hints.ts";
