// Session scanner — discover and list PI sessions

import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export async function scanAllSessions(
  onProgress?: (loaded: number, total: number) => void,
): Promise<SessionInfo[]> {
  const sessions = await SessionManager.listAll(onProgress);
  // Sort by modified date descending (most recent first)
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return sessions;
}
