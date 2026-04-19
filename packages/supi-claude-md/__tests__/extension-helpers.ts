export const DEFAULT_CONFIG = {
  rereadInterval: 3,
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

export function makeCtx(cwd = "/project") {
  return { cwd };
}
