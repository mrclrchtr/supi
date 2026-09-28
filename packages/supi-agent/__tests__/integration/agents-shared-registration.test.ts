import type { ExtensionAPI, RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

interface TestExtensionApi {
  readonly api: ExtensionAPI;
  readonly commands: Map<string, RegisteredCommand>;
  emit(event: string, ...args: unknown[]): Promise<void>;
}

interface Overlay {
  render(width: number): string[];
  dispose?(): void;
}

const runtimes: TestExtensionApi[][] = [];

function makeExtensionApi(eventBus: ReturnType<typeof createEventBus>): TestExtensionApi {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const commands = new Map<string, RegisteredCommand>();
  const api = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
      return () => {
        const index = eventHandlers.indexOf(handler);
        if (index >= 0) eventHandlers.splice(index, 1);
      };
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    events: {
      on: (channel: string, listener: (data: unknown) => void) => eventBus.on(channel, listener),
      emit: (channel: string, data: unknown) => eventBus.emit(channel, data),
    },
  } as unknown as ExtensionAPI;
  return {
    api,
    commands,
    async emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) await handler(...args);
    },
  };
}

async function loadCommandModuleCopy() {
  return import("@mrclrchtr/supi-agent-runtime/api");
}

async function closeRuntime(apis: TestExtensionApi[]): Promise<void> {
  const first = apis[0];
  await first?.emit("session_shutdown", { type: "session_shutdown", reason: "test" });
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(closeRuntime));
  vi.resetModules();
});

describe("shared /agents registration", () => {
  it.each(["agent-first", "review-first"] as const)(
    "registers one /agents command across distinct APIs and runtime copies (%s)",
    async (order) => {
      const eventBus = createEventBus();
      const agent = makeExtensionApi(eventBus);
      const review = makeExtensionApi(eventBus);
      const apis = order === "agent-first" ? [agent, review] : [review, agent];
      runtimes.push(apis);

      const profiles = {
        getData: () => ({
          profiles: [
            {
              id: "explore",
              description: "Explore a codebase.",
              source: "package",
              directory: "/profiles/explore",
            },
          ],
          diagnostics: [],
          omittedProfileCount: 0,
          omittedDiagnosticCount: 0,
        }),
      };
      const optionsFor = (extension: TestExtensionApi) =>
        extension === agent ? { profilePages: profiles } : {};
      const firstCopy = await loadCommandModuleCopy();
      firstCopy.registerAgentsCommand(
        apis[0]?.api as ExtensionAPI,
        optionsFor(apis[0] as TestExtensionApi),
      );
      vi.resetModules();
      const bundledCopy = await loadCommandModuleCopy();
      const registry = bundledCopy.registerAgentsCommand(
        apis[1]?.api as ExtensionAPI,
        optionsFor(apis[1] as TestExtensionApi),
      );

      expect(apis.flatMap((extension) => [...extension.commands.keys()])).toEqual(["agents"]);
      expect(firstCopy.getAgentRunRegistry(apis[0]?.api as ExtensionAPI)).toBe(registry);
      expect(bundledCopy.getAgentRunRegistry(apis[1]?.api as ExtensionAPI)).toBe(registry);

      const commandOwner = apis[0];
      const handler = commandOwner?.commands.get("agents")?.handler as
        | ((args: string, ctx: ReturnType<typeof makeCtx>) => Promise<void>)
        | undefined;
      if (!handler) throw new Error("The shared /agents command was not registered.");
      const base = makeCtx({ mode: "tui" });
      let overlay: Overlay | undefined;
      const custom = vi.fn(async (factory: (...args: unknown[]) => unknown) => {
        overlay = factory(
          { requestRender: vi.fn(), terminal: { rows: 24 } },
          base.ui.theme,
          {},
          vi.fn(),
        ) as Overlay;
      });
      await handler("", makeCtx({ mode: "tui", ui: { ...base.ui, custom } }));

      if (!overlay) throw new Error("The /agents viewer did not open.");
      expect(overlay.render(100).join("\n")).toContain("Profiles 1");
      overlay.dispose?.();
    },
  );

  it("keeps independent Pi runtimes separate and clears state on reload", async () => {
    const module = await loadCommandModuleCopy();
    const firstBus = createEventBus();
    const first = makeExtensionApi(firstBus);
    runtimes.push([first]);
    const firstRegistry = module.registerAgentsCommand(first.api);

    const otherRuntime = makeExtensionApi(createEventBus());
    runtimes.push([otherRuntime]);
    module.registerAgentsCommand(otherRuntime.api);
    expect(module.getAgentRunRegistry(otherRuntime.api)).not.toBe(firstRegistry);

    await first.emit("session_shutdown", { type: "session_shutdown", reason: "reload" });
    const reloaded = makeExtensionApi(firstBus);
    runtimes.push([reloaded]);
    module.registerAgentsCommand(reloaded.api);

    expect(module.getAgentRunRegistry(reloaded.api)).not.toBe(firstRegistry);
    expect(reloaded.commands.has("agents")).toBe(true);
  });
});
