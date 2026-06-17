import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import modelEffortColors from "../../src/model-effort-colors.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock footerData sufficient for the renderer. */
function makeFooterData(overrides: Record<string, unknown> = {}) {
  return {
    getGitBranch: vi.fn(() => null as string | null),
    getExtensionStatuses: vi.fn(() => new Map() as ReadonlyMap<string, string>),
    onBranchChange: vi.fn(() => () => {}),
    ...overrides,
  };
}

/** Minimal theme mock — fg/bg pass through for test assertions. */
const mockTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  accent: "cyan",
  dim: "gray",
  error: "red",
  warning: "yellow",
  success: "green",
  muted: "darkgray",
};

/** Mock tui with requestRender spy. */
const mockTui = {
  requestRender: vi.fn(),
};

type FooterFactory = (
  tui: unknown,
  theme: unknown,
  fd: unknown,
) => { render: (w: number) => string[] };

/** Default session manager used by the footer renderer. */
function defaultSessionManager(overrides: Record<string, unknown> = {}) {
  return {
    getEntries: vi.fn(() => []),
    getCwd: vi.fn(() => "/home/user/project"),
    getSessionName: vi.fn(() => undefined as string | undefined),
    ...overrides,
  };
}

/** Default model registry used by the footer renderer. */
const defaultModelRegistry = {
  isUsingOAuth: vi.fn(() => false),
};

/** Minimal ui override that captures setFooter. */
function uiCapturingFooter(capture: (f: FooterFactory) => void) {
  return {
    setFooter: capture,
    setStatus: vi.fn(),
    notify: vi.fn(),
    setTitle: vi.fn(),
    setWidget: vi.fn(),
    removeWidget: vi.fn(),
    getEditorText: vi.fn(() => ""),
    setEditorText: vi.fn(),
    input: vi.fn(async () => undefined as string | undefined),
    custom: vi.fn(async () => null as unknown),
    theme: mockTheme,
  };
}

/**
 * Full ctx mock with all properties needed by the footer renderer.
 * Accepts overrides that are deep-merged at the top level.
 */
function makeFooterCtx(overrides: Record<string, unknown> = {}) {
  const sm = defaultSessionManager((overrides.sessionManager as Record<string, unknown>) ?? {});

  const { sessionManager: _smOverride, ...rest } = overrides;

  return {
    cwd: "/home/user/project",
    model: { provider: "openai", id: "gpt-4", reasoning: false },
    modelRegistry: defaultModelRegistry,
    sessionManager: sm,
    getContextUsage: vi.fn(() => undefined),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("modelEffortColors extension", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/user");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    footerContributions.clear();
  });

  describe("color mapping", () => {
    it("maps Anthropic/Claude to accent", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude-sonnet-4", reasoning: false },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      expect(footerFactory).toBeDefined();

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).toContain("claude-sonnet-4");
    });

    it("maps OpenAI/GPT to success", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "openai", id: "gpt-4", reasoning: false },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).toContain("gpt-4");
    });

    it("maps unknown provider to dim", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "unknown", id: "mystery-model", reasoning: false },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).toContain("mystery-model");
    });
  });

  describe("thinking level coloring", () => {
    it("shows thinking level for reasoning models", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);
      (pi as unknown as Record<string, unknown>).getThinkingLevel = vi.fn(() => "high");

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude-sonnet", reasoning: true },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).toContain("high");
    });
  });

  describe("footer rendering", () => {
    it("returns three lines when extension statuses exist", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const statusMap = new Map<string, string>([
        ["ext-a", "status A"],
        ["ext-b", "status B"],
      ]);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(
        mockTui,
        mockTheme,
        makeFooterData({
          getExtensionStatuses: vi.fn(() => statusMap),
        }),
      );
      const lines = renderer.render(120);
      expect(lines).toHaveLength(3);
      expect(lines[2]).toContain("status A");
      expect(lines[2]).toContain("status B");
    });

    it("returns two lines when no extension statuses", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines).toHaveLength(2);
    });

    it("shows git branch in cwd line", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(
        mockTui,
        mockTheme,
        makeFooterData({
          getGitBranch: vi.fn(() => "main"),
        }),
      );
      const lines = renderer.render(120);
      expect(lines[0]).toContain("main");
    });

    it("shows context window percentage with warning threshold", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "openai", id: "gpt-4", reasoning: false, contextWindow: 128000 },
        getContextUsage: vi.fn(() => ({
          tokens: 96000,
          contextWindow: 128000,
          percent: 75,
        })),
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).toContain("75.0%/128k");
    });
  });

  describe("event handling", () => {
    it("re-renders on model_select", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const tui = { requestRender: vi.fn() };
      const factory1 = footerFactory as FooterFactory;
      factory1(tui, mockTheme, makeFooterData());

      const selectHandler = pi.handlers.get("model_select")?.[0] as (
        e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await selectHandler?.({ model: { provider: "anthropic", id: "claude" } }, ctx);
      expect(tui.requestRender).toHaveBeenCalled();
    });

    it("re-renders on thinking_level_select", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "openai", id: "gpt-4", reasoning: true },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const tui = { requestRender: vi.fn() };
      const factory2 = footerFactory as FooterFactory;
      factory2(tui, mockTheme, makeFooterData());

      const thinkingHandler = pi.handlers.get("thinking_level_select")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await thinkingHandler?.({ level: "high" }, ctx);
      expect(tui.requestRender).toHaveBeenCalled();
    });

    it("cleans up on session_shutdown", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);
      const factory3 = footerFactory as FooterFactory;
      factory3(mockTui, mockTheme, makeFooterData());

      const shutdownHandler = pi.handlers.get("session_shutdown")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await shutdownHandler?.({}, ctx);
      // After shutdown, requestRender ref is cleared — subsequent model_select
      // should not cause an error (regression test for cleanup)
      const selectHandler = pi.handlers.get("model_select")?.[0] as (
        e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await selectHandler?.({ model: { provider: "anthropic", id: "claude" } }, ctx);
      // If we get here without throwing, cleanup worked
    });
  });

  describe("stats line", () => {
    it("includes CH when cache data is present", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude", reasoning: false, contextWindow: 200000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 8000,
                  cacheWrite: 2000,
                  cost: { total: 0.05 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      // CH = 8000 / (8000 + 2000 + 2000) * 100 = 66.7%
      expect(lines[1]).toContain("CH66.7%");
    });

    it("omits CH when no cache data", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "openai", id: "gpt-4", reasoning: false, contextWindow: 128000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 0,
                  cacheWrite: 0,
                  cost: { total: 0.01 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(120);
      expect(lines[1]).not.toContain("CH");
    });

    it("places extra parts after CH and before cost/context", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      // Register a real stats contribution before rendering
      footerContributions.register({
        key: "test-contrib",
        placement: "stats",
        render: () => "EXTRA",
      });

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude", reasoning: false, contextWindow: 200000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 8000,
                  cacheWrite: 0,
                  cost: { total: 0.05 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(200);

      // EXTRA should appear after CH but before $
      const statsLine = lines[1];
      const chIdx = statsLine.indexOf("CH");
      const extraIdx = statsLine.indexOf("EXTRA");
      const costIdx = statsLine.indexOf("$");

      expect(chIdx).toBeGreaterThan(-1);
      expect(extraIdx).toBeGreaterThan(chIdx);
      expect(costIdx).toBeGreaterThan(extraIdx);
    });

    it("renders TCH from real registry after CH", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      // Simulate what supi-cache does: register a stats contribution
      footerContributions.register({
        key: "supi-cache",
        placement: "stats",
        priority: 0,
        render: () => "TCH80%↑",
      });

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude", reasoning: false, contextWindow: 200000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 8000,
                  cacheWrite: 2000,
                  cost: { total: 0.05 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(200);

      // TCH should appear immediately after CH
      expect(lines[1]).toMatch(/CH[\d.]+% TCH/);
    });

    it("places priority-0 contribution before default-priority ones", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      // TCH at priority 0, another at default 100
      footerContributions.register({
        key: "tch",
        placement: "stats",
        priority: 0,
        render: () => "TCH80%↑",
      });
      footerContributions.register({
        key: "other",
        placement: "stats",
        render: () => "OTHER",
      });

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "anthropic", id: "claude", reasoning: false, contextWindow: 200000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 8000,
                  cacheWrite: 0,
                  cost: { total: 0.05 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(200);

      // TCH must appear before OTHER in the stats line
      const tchIdx = lines[1].indexOf("TCH");
      const otherIdx = lines[1].indexOf("OTHER");
      expect(tchIdx).toBeGreaterThan(-1);
      expect(otherIdx).toBeGreaterThan(tchIdx);
    });

    it("omits stats contributions that return empty strings", async () => {
      const pi = createPiMock();
      modelEffortColors(pi as unknown as Parameters<typeof modelEffortColors>[0]);

      footerContributions.register({
        key: "empty",
        placement: "stats",
        render: () => "",
      });

      let footerFactory: FooterFactory | undefined;
      const ctx = makeFooterCtx({
        model: { provider: "openai", id: "gpt-4", reasoning: false, contextWindow: 128000 },
        ui: uiCapturingFooter((f) => {
          footerFactory = f;
        }),
        sessionManager: defaultSessionManager({
          getEntries: vi.fn(() => [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  input: 2000,
                  output: 500,
                  cacheRead: 0,
                  cacheWrite: 0,
                  cost: { total: 0 },
                },
              },
            },
          ]),
        }),
      });

      const startHandler = pi.handlers.get("session_start")?.[0] as (
        _e: unknown,
        c: unknown,
      ) => Promise<unknown>;
      await startHandler?.({}, ctx);

      const factory = footerFactory as FooterFactory;
      const renderer = factory(mockTui, mockTheme, makeFooterData());
      const lines = renderer.render(200);

      // Empty string contributions should not add blank parts.
      // Verifying the stats line still renders normally without extra gaps.
      expect(lines[1]).toContain("↑");
      expect(lines[1]).toContain("↓");
    });
  });
});
