import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";

export default function cloneSession(pi: ExtensionAPI) {
  let completionSessions: Awaited<ReturnType<typeof SessionManager.listAll>> | undefined;

  pi.registerCommand("clone-session", {
    description: "Clone a session by ID into this worktree and switch to it",
    getArgumentCompletions: async (prefix) => {
      completionSessions ??= await SessionManager.listAll();
      const query = prefix.trim().toLowerCase();
      const matches = completionSessions.filter(
        (session) => session.id.startsWith(query) || session.name?.toLowerCase().includes(query),
      );
      return matches.length > 0
        ? matches.map((session) => ({
            value: session.id,
            label: session.id,
            description: [session.name, session.cwd].filter(Boolean).join(" — ") || undefined,
          }))
        : null;
    },
    handler: async (args, ctx) => {
      const sessionId = args.trim();
      if (!sessionId) {
        ctx.ui.notify("Usage: /clone-session <session-id>", "warning");
        return;
      }

      let sessionFile: string;
      try {
        const sourceSession = (await SessionManager.listAll()).find(
          (session) => session.id === sessionId,
        );
        if (!sourceSession) {
          ctx.ui.notify(`Session not found: ${sessionId}`, "warning");
          return;
        }

        const clonedSessionFile = SessionManager.forkFrom(
          sourceSession.path,
          ctx.cwd,
        ).getSessionFile();
        if (!clonedSessionFile) throw new Error("cloned session was not persisted");
        sessionFile = clonedSessionFile;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not clone session: ${message}`, "error");
        return;
      }

      const result = await ctx.switchSession(sessionFile, {
        withSession: async (nextCtx) => {
          nextCtx.ui.notify("Session cloned into this worktree", "info");
        },
      });
      if (result.cancelled) ctx.ui.notify(`Session cloned to ${sessionFile}`, "info");
    },
  });
}
