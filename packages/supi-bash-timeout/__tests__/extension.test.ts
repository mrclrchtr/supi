import { clearRegisteredSettings, getRegisteredSettings } from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bashTimeout from "../bash-timeout.ts";
import { loadBashTimeoutConfig } from "../config.ts";

vi.mock("../config.ts", () => ({
  loadBashTimeoutConfig: vi.fn(),
  BASH_TIMEOUT_DEFAULTS: { defaultTimeout: 120 },
}));

function createPiMock() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  return {
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getHandlers: (event: string) => handlers.get(event) ?? [],
  };
}

function createCtxMock(cwd: string) {
  return { cwd };
}

describe("bashTimeout extension", () => {
  beforeEach(() => {
    clearRegisteredSettings();
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 120 });
  });

  afterEach(() => {
    clearRegisteredSettings();
    vi.clearAllMocks();
  });

  it("registers settings on factory call", () => {
    const pi = createPiMock();
    bashTimeout(pi as unknown as Parameters<typeof bashTimeout>[0]);

    const sections = getRegisteredSettings();
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "bash-timeout", label: "Bash Timeout" });
  });

  it("injects default timeout when LLM omits it", async () => {
    const pi = createPiMock();
    bashTimeout(pi as unknown as Parameters<typeof bashTimeout>[0]);

    const event = {
      toolName: "bash",
      input: { command: "sleep 5", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    expect(handlers).toHaveLength(1);

    await handlers[0](event, createCtxMock("/tmp"));
    expect(event.input.timeout).toBe(120);
  });

  it("does not inject timeout when LLM already specified one", async () => {
    const pi = createPiMock();
    bashTimeout(pi as unknown as Parameters<typeof bashTimeout>[0]);

    const event = {
      toolName: "bash",
      input: { command: "sleep 5", timeout: 30 as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, createCtxMock("/tmp"));
    expect(event.input.timeout).toBe(30);
  });

  it("ignores non-bash tool calls", async () => {
    const pi = createPiMock();
    bashTimeout(pi as unknown as Parameters<typeof bashTimeout>[0]);

    const event = {
      toolName: "read",
      input: { path: "/tmp/file.txt", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, createCtxMock("/tmp"));
    expect(event.input.timeout).toBeUndefined();
  });

  // biome-ignore lint/security/noSecrets: false positive — test description
  it("uses configured timeout from loadBashTimeoutConfig", async () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 300 });

    const pi = createPiMock();
    bashTimeout(pi as unknown as Parameters<typeof bashTimeout>[0]);

    const event = {
      toolName: "bash",
      input: { command: "sleep 10", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, createCtxMock("/tmp"));
    expect(event.input.timeout).toBe(300);
  });
});
