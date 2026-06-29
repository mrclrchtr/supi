import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  clearDebugEvents: vi.fn(),
  configureDebugRegistry: vi.fn(),
  getDebugEvents: vi.fn(),
  getDebugSummary: vi.fn(),
  loadSupiConfig: vi.fn(),
  registerConfigSettings: vi.fn(),
  registerContextProvider: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSupiConfig: mockFns.loadSupiConfig,
  registerConfigSettings: mockFns.registerConfigSettings,
}));

vi.mock("@mrclrchtr/supi-core/context", () => ({
  registerContextProvider: mockFns.registerContextProvider,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  clearDebugEvents: mockFns.clearDebugEvents,
  configureDebugRegistry: mockFns.configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS: {
    enabled: false,
    agentAccess: "sanitized",
    maxEvents: 100,
    notifyLevel: "off",
  },
  getDebugEvents: mockFns.getDebugEvents,
  getDebugSummary: mockFns.getDebugSummary,
}));

import { createPiMock } from "@mrclrchtr/supi-test-utils";
import debugExtension from "../../src/debug.ts";

function setup(
  config = { enabled: true, agentAccess: "sanitized", maxEvents: 100, notifyLevel: "off" },
) {
  mockFns.loadSupiConfig.mockReturnValue(config);
  mockFns.configureDebugRegistry.mockImplementation((value) => value);
  mockFns.getDebugEvents.mockReturnValue({ events: [], rawAccessDenied: false });
  mockFns.getDebugSummary.mockReturnValue(null);
  const pi = createPiMock();
  debugExtension(pi as never);
  return pi;
}

function makeTool(pi: ReturnType<typeof createPiMock>) {
  return pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
}

describe("supi-debug tool output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when debug capture is disabled", async () => {
    const pi = setup({
      enabled: false,
      agentAccess: "sanitized",
      maxEvents: 100,
      notifyLevel: "off",
    });
    const tool = makeTool(pi);

    await expect(tool.execute("id", {}, undefined, undefined, { cwd: "/repo" })).rejects.toThrow(
      "SuPi debug event capture is disabled",
    );
  });

  it("truncates large tool output and reports truncation metadata", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: Array.from({ length: 2_100 }, (_, index) => ({
        id: index + 1,
        timestamp: 1_700_000_000_000 + index,
        source: "lsp",
        level: "debug",
        category: "trace",
        message: `event-${index + 1}`,
      })),
    });
    const tool = makeTool(pi);

    const result = (await tool.execute("id", {}, undefined, undefined, { cwd: "/repo" })) as {
      content: Array<{ text: string }>;
      details: { truncation?: { truncated: boolean; outputLines: number; totalLines: number } };
    };

    expect(mockFns.getDebugEvents).toHaveBeenCalledOnce();
    expect(result.content[0]?.text).toContain("[Output truncated:");
    expect(result.details.truncation).toMatchObject({
      truncated: true,
      totalLines: 2_100,
    });
    expect(result.details.truncation?.outputLines).toBeLessThan(2_100);
  });
});
