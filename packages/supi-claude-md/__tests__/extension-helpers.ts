export const DEFAULT_CONFIG = {
  rereadInterval: 3,
  contextThreshold: 80,
  subdirs: true,
  fileNames: ["CLAUDE.md", "AGENTS.md"],
};

export function createPiMock() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const commands = new Map<string, unknown>();

  return {
    handlers,
    commands,
    pi: {
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand(name: string, spec: unknown) {
        commands.set(name, spec);
      },
    },
  };
}

export function makeCtx(
  cwd = "/project",
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null },
) {
  return {
    cwd,
    getContextUsage: () => contextUsage,
  };
}
