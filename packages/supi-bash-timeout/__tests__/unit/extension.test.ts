import type { SettingsModule } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import bashTimeout from "../../src/bash-timeout.ts";
import { loadBashTimeoutConfig } from "../../src/config.ts";

vi.mock("../../src/config.ts", () => ({
  loadBashTimeoutConfig: vi.fn(),
  BASH_TIMEOUT_DEFAULTS: { defaultTimeout: 120 },
}));

function collectModule(pi: ReturnType<typeof createPiMock>): SettingsModule {
  let captured: SettingsModule | undefined;
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add(module: SettingsModule) {
      captured = module;
    },
  });
  return captured!;
}

describe("bashTimeout extension", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers settings on factory call", () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 120 });
    const pi = createPiMock();
    bashTimeout(pi as never);

    const module = collectModule(pi);
    expect(module).toMatchObject({ id: "bash-timeout", label: "Bash Timeout" });
  });

  it("injects default timeout when LLM omits it", async () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 120 });
    const pi = createPiMock();
    bashTimeout(pi as never);

    const event = {
      toolName: "bash",
      input: { command: "sleep 5", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    expect(handlers).toHaveLength(1);

    await handlers[0](event, makeCtx({ cwd: "/tmp" }));
    expect(event.input.timeout).toBe(120);
  });

  it("does not inject timeout when LLM already specified one", async () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 120 });
    const pi = createPiMock();
    bashTimeout(pi as never);

    const event = {
      toolName: "bash",
      input: { command: "sleep 5", timeout: 30 as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, makeCtx({ cwd: "/tmp" }));
    expect(event.input.timeout).toBe(30);
  });

  it("ignores non-bash tool calls", async () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 120 });
    const pi = createPiMock();
    bashTimeout(pi as never);

    const event = {
      toolName: "read",
      input: { path: "/tmp/file.txt", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, makeCtx({ cwd: "/tmp" }));
    expect(event.input.timeout).toBeUndefined();
  });

  // biome-ignore lint/security/noSecrets: false positive — test description
  it("uses configured timeout from loadBashTimeoutConfig", async () => {
    vi.mocked(loadBashTimeoutConfig).mockReturnValue({ defaultTimeout: 300 });

    const pi = createPiMock();
    bashTimeout(pi as never);

    const event = {
      toolName: "bash",
      input: { command: "sleep 10", timeout: undefined as number | undefined },
    };

    const handlers = pi.getHandlers("tool_call");
    await handlers[0](event, makeCtx({ cwd: "/tmp" }));
    expect(event.input.timeout).toBe(300);
  });
});
