// supi-core session domain — session utilities and registries.

export { createRegistry, createSessionStateRegistry } from "./registry-utils.ts";
export type {
  SessionCapabilitySkill,
  SessionCapabilitySkillProvider,
  SessionCapabilityState,
} from "./session-capabilities.ts";
export {
  clearPendingSessionCapabilityForks,
  createEmptySessionCapabilityState,
  decodeSessionCapabilities,
  findSessionCapabilities,
  getSessionCapabilitySkillProvider,
  readPendingSessionCapabilityFork,
  registerSessionCapabilitySkillProvider,
  SESSION_CAPABILITIES_ENTRY,
  sessionCapabilityState,
  setPendingSessionCapabilityFork,
} from "./session-capabilities.ts";
export type { SessionNameTrackerHost } from "./session-utils.ts";
export {
  createSessionNameTracker,
  getActiveBranchEntries,
} from "./session-utils.ts";
