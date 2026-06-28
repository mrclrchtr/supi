import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockLoadSectionConfig = vi.hoisted(() => vi.fn());
const mockGetSelectableModels = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSectionConfig: mockLoadSectionConfig,
}));

vi.mock("@mrclrchtr/supi-core/model-selection", () => ({
  getSelectableModels: mockGetSelectableModels,
}));

import { resolveSuggestionAuth } from "../../src/generation/model-resolution.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

const mockModelSelection = {
  canonicalId: "anthropic/claude-sonnet-4-5",
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  model: { provider: "anthropic", id: "claude-sonnet-4-5" },
  label: "Claude Sonnet 4.5",
  description: "anthropic/claude-sonnet-4-5",
  isCurrent: false,
};

function makeCtx(overrides: { cwd?: string; getApiKeyAndHeaders?: ReturnType<typeof vi.fn> } = {}) {
  return {
    cwd: overrides.cwd ?? "/fake/project",
    modelRegistry: {
      getApiKeyAndHeaders:
        overrides.getApiKeyAndHeaders ??
        vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    },
    model: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("resolveSuggestionAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves auth when model is found and API key is available", async () => {
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockGetSelectableModels.mockReturnValue([mockModelSelection]);

    const ctx = makeCtx();
    const result = await resolveSuggestionAuth(ctx as never);

    expect(result).toEqual({
      kind: "ok",
      auth: {
        model: { provider: "anthropic", id: "claude-sonnet-4-5" },
        apiKey: "test-key",
      },
    });
  });

  it("reports error when model is not in scoped set", async () => {
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/nonexistent" });
    mockGetSelectableModels.mockReturnValue([]);

    const ctx = makeCtx();
    const result = await resolveSuggestionAuth(ctx as never);

    expect(result).toEqual({
      kind: "error",
      message: 'Suggestion model "anthropic/nonexistent" not in scoped set',
    });
  });

  it("reports error when API key auth fails", async () => {
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockGetSelectableModels.mockReturnValue([mockModelSelection]);

    const ctx = makeCtx({
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false }),
    });
    const result = await resolveSuggestionAuth(ctx as never);

    expect(result).toEqual({
      kind: "error",
      message: "No API key configured for anthropic/claude-sonnet-4-5",
    });
  });
});
