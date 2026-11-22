/**
 * Neutral background test harness for extensions that start Agent Runs in child SDK sessions.
 *
 * The harness loads a real extension into a Pi mock, answers its SDK child-session requests
 * with controlled sessions, drives parent turn boundaries, and persists tool results in a real
 * parent `SessionManager`. It knows nothing about a particular owner package: the extension,
 * its tool invocations, and how a child is identified are inputs.
 *
 * Import it from `@mrclrchtr/supi-test-utils/background` so tests that do not need the Pi SDK
 * do not load it through the package root.
 */
import { mkdtemp, rm } from "node:fs/promises";
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
import { type Mock, vi } from "vitest";
import { controlledSession } from "./background-session.ts";
import { getHandlerOrThrow } from "./handler-utils.ts";
import { createPiMock, makeCtx, type PiMock } from "./pi-mock.ts";
import { getTools } from "./tool-utils.ts";

export { controlledSession } from "./background-session.ts";

/** Usage every controlled child bills unless a test passes its own. */
export const controlledUsage: Usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
};

/** The SDK factories a test replaces with `vi.mock("@earendil-works/pi-coding-agent")`. */
export interface ControlledSdk {
  createAgentSession: Mock;
  createAgentSessionRuntime: Mock;
}

/** Inputs of {@link backgroundHarness}. */
export interface BackgroundHarnessOptions {
  /** Mocked SDK factories that the extension under test calls to create child sessions. */
  sdk: ControlledSdk;
  /** The extension under test; it is loaded once and receives `session_start`. */
  extension: (pi: ExtensionAPI) => void;
  /** Persist the parent session to disk so `reopenParent()` reopens the file. */
  persistentParent?: boolean;
  /** Usage billed by controlled children; defaults to {@link controlledUsage}. */
  childUsage?: Usage;
  /** Base parent context; defaults to a neutral test model context. */
  baseContext?: () => ExtensionContext;
  /** Maps a `child(key)` lookup to text contained in that child's first prompt; defaults to the key. */
  childPrompt?: (key: string) => string;
  /** Runs after the temporary Pi agent directory is configured and before the extension loads. */
  prepare?: (paths: { directory: string; agentDir: string }) => Promise<void> | void;
}

/** How a single tool invocation is persisted and whether it ends the parent turn. */
export interface InvocationOptions {
  /** Store the tool result in the parent session (default `true`). */
  persist?: boolean;
  /** End the parent turn once no invocation is in flight (default `true`). */
  endTurn?: boolean;
  /** Emulates a `tool_result` hook that patches the stored result. */
  resultHook?: (result: AgentToolResult<Record<string, unknown>>) => ToolResultEventResult;
}

/** A controlled child session created by the harness. */
export type ControlledChild = ReturnType<typeof controlledSession>;

/** Startup gate returned by `holdNextStartup()`. */
export type StartupGate = ReturnType<typeof startupGate>;

/** The harness returned by {@link backgroundHarness}. */
export type BackgroundHarness = Awaited<ReturnType<typeof backgroundHarness>>;

/** Controlled SDK sessions and parent turn boundaries; all extension code under test remains real. */
export async function backgroundHarness(options: BackgroundHarnessOptions) {
  const { sdk } = options;
  const childUsage = options.childUsage ?? controlledUsage;
  const baseContext = options.baseContext ?? testModelContext;
  const childPrompt = options.childPrompt ?? ((key: string) => key);
  const directory = await mkdtemp(join(tmpdir(), "supi-background-"));
  const agentDir = join(directory, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("HOME", join(directory, "home"));
  await options.prepare?.({ directory, agentDir });
  const parentManager = options.persistentParent
    ? SessionManager.create(directory, join(directory, "sessions"))
    : SessionManager.inMemory(directory);
  const { children, holdNextStartup } = controlSdk(sdk, childUsage);
  const pi = createPiMock();
  const parentContext = (cwd: string, manager: SessionManager) =>
    createParentContext(baseContext(), cwd, manager);
  let ctx = parentContext(directory, parentManager);
  let aborted = false;
  let turnsStarted = 0;
  const queued: Record<string, unknown>[] = [];
  vi.mocked(pi.sendMessage).mockImplementation((message, delivery?: { triggerTurn?: boolean }) => {
    pi.messages.push(message);
    if (!ctx.isIdle()) queued.push({ role: "custom", timestamp: Date.now(), ...message });
    else if (delivery?.triggerTurn) turnsStarted++;
  });
  options.extension(pi as unknown as ExtensionAPI);
  await pi.emit("session_start", { type: "session_start", reason: "startup" }, ctx);
  const turns = parentTurns(pi, () => ctx, childUsage);
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
    get queued() {
      return [...queued];
    },
    get turnsStarted() {
      return turnsStarted;
    },
    /** The child whose first prompt contains `childPrompt(key)`. */
    child(key: string) {
      const text = childPrompt(key);
      const child = children.find((entry) =>
        entry.session.prompt.mock.calls[0]?.[0].includes(text),
      );
      if (!child) throw new Error(`Missing child for ${key}.`);
      return child;
    },
    holdNextStartup,
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

/** Answer the extension's SDK child-session requests with controlled sessions. */
function controlSdk(sdk: ControlledSdk, childUsage: Usage) {
  const children: ControlledChild[] = [];
  let startup: StartupGate | undefined;
  sdk.createAgentSession.mockImplementation(async (inputs) => {
    const gate = startup;
    startup = undefined;
    if (gate) {
      gate.enter();
      await gate.ready;
    }
    const child = controlledSession(
      inputs.tools,
      childUsage,
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
  return {
    children,
    /** Pause the next child creation until the returned gate is released. */
    holdNextStartup(): StartupGate {
      startup = startupGate();
      return startup;
    },
  };
}

/** A neutral parent context with one test model that has configured auth. */
function testModelContext(): ExtensionContext {
  const model = {
    provider: "test",
    id: "model",
    name: "Test",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 4_000,
  };
  return makeCtx({
    cwd: "/repo",
    model,
    modelRegistry: {
      find: () => model,
      hasConfiguredAuth: () => true,
    },
    thinkingLevel: "medium",
    scopedModels: [],
    isProjectTrusted: () => false,
    signal: undefined,
  }) as unknown as ExtensionContext;
}

function createParentContext(
  base: ExtensionContext,
  cwd: string,
  manager: SessionManager,
): ExtensionContext {
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
function parentTurns(pi: PiMock, current: () => ExtensionContext, usage: Usage) {
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
