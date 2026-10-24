import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import {
  type AgentToolResult,
  type ExtensionAPI,
  type ExtensionContext,
  SessionManager,
  type ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { createPiMock, getHandlerOrThrow, getTools } from "@mrclrchtr/supi-test-utils";
import { type Mock, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import { context } from "./agent-run-fixtures.ts";
import { controlledSession } from "./background-session.ts";

export const task = (id = "one", profile = "explore") => ({
  id,
  new: { profile },
  instructions: `Inspect ${id} module.`,
});
export const usage: Usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
};
interface InvocationOptions {
  persist?: boolean;
  endTurn?: boolean;
  resultHook?: (result: AgentToolResult<Record<string, unknown>>) => ToolResultEventResult;
}

/** Controlled SDK sessions and parent turn boundaries; all SuPi runtime code remains real. */
export async function backgroundHarness(
  sdk: { createAgentSession: Mock; createAgentSessionRuntime: Mock },
  options: { timeoutMinutes?: number; persistentParent?: boolean } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "supi-background-"));
  const agentDir = join(directory, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("HOME", join(directory, "home"));
  if (options.timeoutMinutes) {
    await mkdir(join(agentDir, "supi/agents/explore"), { recursive: true });
    await writeFile(
      join(agentDir, "supi/agents/explore/profile.json"),
      JSON.stringify({ timeoutMinutes: options.timeoutMinutes }),
    );
  }
  const parentManager = options.persistentParent
    ? SessionManager.create(directory, join(directory, "sessions"))
    : SessionManager.inMemory(directory);
  const children: ReturnType<typeof controlledSession>[] = [];
  let startup: ReturnType<typeof startupGate> | undefined;
  sdk.createAgentSession.mockImplementation(async (inputs) => {
    const gate = startup;
    startup = undefined;
    if (gate) {
      gate.enter();
      await gate.ready;
    }
    const child = controlledSession(
      inputs.tools,
      usage,
      inputs.sessionManager,
      inputs.settingsManager,
    );
    children.push(child);
    return { session: child.session, extensionsResult: { runtime: child.extensionRuntime } };
  });
  sdk.createAgentSessionRuntime.mockImplementation(async (factory, inputs) => {
    const created = await factory({ ...inputs, sessionStartEvent: { type: "session_start" } });
    const child = children.find((entry) => entry.session === created.session);
    if (!child) throw new Error("Missing controlled SDK session.");
    return child.runtime;
  });
  const pi = createPiMock();
  let ctx = parentContext(directory, parentManager);
  let aborted = false;
  let turnsStarted = 0;
  const queued: Record<string, unknown>[] = [];
  vi.mocked(pi.sendMessage).mockImplementation((message, delivery?: { triggerTurn?: boolean }) => {
    pi.messages.push(message);
    if (!ctx.isIdle()) queued.push({ role: "custom", timestamp: Date.now(), ...message });
    else if (delivery?.triggerTurn) turnsStarted++;
  });
  agentExtension(pi as unknown as ExtensionAPI);
  await pi.emit("session_start", { type: "session_start", reason: "startup" }, ctx);
  const turns = parentTurns(pi, () => ctx);
  return {
    pi,
    children,
    invoke: turns.invoke,
    endTurn: turns.endTurn,
    get ctx() {
      return ctx;
    },
    get agentDir() {
      return agentDir;
    },
    get manager() {
      return ctx.sessionManager as SessionManager;
    },
    get registry() {
      return getAgentRunRegistry(pi as unknown as ExtensionAPI);
    },
    get queued() {
      return [...queued];
    },
    get turnsStarted() {
      return turnsStarted;
    },
    child(id: string) {
      const child = children.find((entry) =>
        entry.session.prompt.mock.calls[0]?.[0].includes(`Inspect ${id} module.`),
      );
      if (!child) throw new Error(`Missing child for ${id}.`);
      return child;
    },
    holdNextStartup() {
      startup = startupGate();
      return startup;
    },
    async beginParent() {
      aborted = false;
      const operation = new AbortController();
      Object.assign(ctx, { signal: operation.signal });
      await pi.emit("agent_start", { type: "agent_start" }, ctx);
      return operation;
    },
    async endParent(wasAborted = false) {
      aborted = wasAborted;
      await pi.emit("agent_settled", { type: "agent_settled", aborted }, ctx);
      Object.assign(ctx, { signal: undefined });
    },
    async deliverQueued() {
      if (aborted) return [];
      const event = { type: "context", messages: [...queued] };
      const filtered = (await getHandlerOrThrow(pi, "context")(event as never, ctx)) as
        | { messages?: unknown[] }
        | undefined;
      queued.length = 0;
      return filtered?.messages ?? event.messages;
    },
    async replaceSession() {
      await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);
      queued.length = 0;
      const replacementCwd = join(directory, "replacement");
      ctx = parentContext(replacementCwd, SessionManager.inMemory(replacementCwd));
      await pi.emit("session_start", { type: "session_start", reason: "switch" }, ctx);
    },
    async reopenParent() {
      const previous = ctx.sessionManager as SessionManager;
      const entries = previous.getEntries();
      const leafId = previous.getLeafId();
      const cwd = ctx.cwd;
      const sessionFile = previous.getSessionFile();
      await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);
      queued.length = 0;
      const manager =
        options.persistentParent && sessionFile
          ? SessionManager.open(sessionFile, undefined, cwd)
          : SessionManager.inMemory(cwd, undefined, entries);
      if (!(options.persistentParent && sessionFile) && leafId !== null) manager.branch(leafId);
      ctx = parentContext(cwd, manager);
      await pi.emit("session_start", { type: "session_start", reason: "resume" }, ctx);
    },
    async openParent(manager: SessionManager) {
      const cwd = ctx.cwd;
      await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);
      queued.length = 0;
      ctx = parentContext(cwd, manager);
      await pi.emit("session_start", { type: "session_start", reason: "resume" }, ctx);
    },
    async close() {
      await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function parentContext(cwd: string, manager: SessionManager): ExtensionContext {
  const base = context();
  const ctx = {
    ...base,
    cwd,
    sessionManager: manager,
    signal: undefined as AbortSignal | undefined,
    isIdle: () => !ctx.signal,
    modelRegistry: {
      ...base.modelRegistry,
      getProvider: () => ({
        id: "test",
        name: "Test",
        getModels: () => [base.model],
        auth: { apiKey: { name: "Test", resolve: async () => ({ auth: { apiKey: "test" } }) } },
        stream: vi.fn(),
        streamSimple: vi.fn(),
      }),
      getProviderAuth: async () => ({ auth: { apiKey: "test" } }),
    },
  } as unknown as ExtensionContext;
  return ctx;
}

/** A turn ends after all in-flight results are stored, not after each sibling tool. */
function parentTurns(pi: ReturnType<typeof createPiMock>, current: () => ExtensionContext) {
  let call = 0;
  let active = 0;
  const entryIds: string[] = [];
  const endTurn = async () => {
    await pi.emit(
      "turn_end",
      { type: "turn_end", toolResultEntryIds: entryIds.splice(0) },
      current(),
    );
  };
  return {
    endTurn,
    async invoke(name: string, params: unknown, options: boolean | InvocationOptions = true) {
      const settings = typeof options === "boolean" ? { persist: options } : options;
      const ctx = current();
      const manager = ctx.sessionManager as SessionManager;
      const toolCallId = `call-${++call}`;
      manager.appendMessage({
        role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name, arguments: params }],
        api: "openai-completions",
        provider: "test",
        model: "model",
        usage,
        stopReason: "toolUse",
        timestamp: Date.now(),
      } as never);
      const tool = getTools(pi)
        .filter((entry) => entry.name === name)
        .at(-1);
      if (!tool) throw new Error(`Missing tool ${name}.`);
      active++;
      try {
        const result = (await tool.execute(
          toolCallId,
          params,
          ctx.signal,
          undefined,
          ctx,
        )) as AgentToolResult<Record<string, unknown>>;
        if (settings.persist !== false) {
          const patch = settings.resultHook?.(result);
          // Pi preserves original Usage and details unless the result hook replaces them.
          entryIds.push(
            manager.appendMessage({
              role: "toolResult",
              toolCallId,
              toolName: name,
              ...result,
              ...patch,
              usage: patch?.usage ?? result.usage,
              details: patch?.details ?? result.details,
              isError: patch?.isError ?? false,
              timestamp: Date.now(),
            } as Parameters<typeof manager.appendMessage>[0]),
          );
        }
        return result;
      } finally {
        active--;
        if (
          active === 0 &&
          settings.endTurn !== false &&
          settings.persist !== false &&
          ctx === current()
        )
          await endTurn();
      }
    },
  };
}

function startupGate() {
  let enter: () => void = () => undefined;
  let release: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { enter, release, entered, ready };
}
