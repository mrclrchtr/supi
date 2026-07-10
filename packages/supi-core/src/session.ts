// supi-core session domain — session utilities and registries.

export { createRegistry, createSessionStateRegistry } from "./registry-utils.ts";
export type { SessionNameTrackerHost } from "./session-utils.ts";
export {
  createSessionNameTracker,
  getActiveBranchEntries,
} from "./session-utils.ts";
