import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeIntelligenceApp } from "../../../src/app/create-code-intelligence-app.ts";

/**
 * Model-cache tests.
 *
 * Verifies:
 * - Architecture models are reused within one workspace session
 * - The cache stores models by workspace key
 * - Models are available via workspace session's modelCache
 */
describe("model-cache", () => {
  let app: ReturnType<typeof createCodeIntelligenceApp>;
  let pi: ReturnType<typeof createPiMock>;

  beforeEach(() => {
    vi.restoreAllMocks();
    getDefaultWorkspaceRuntime().clearAll();
    pi = createPiMock() as never;
    app = createCodeIntelligenceApp(pi as never);
  });

  it("stores and retrieves a cached model via session", () => {
    const session = app.createSession("/project");
    expect(session.modelCache).toEqual({});

    session.modelCache = { archModel: { name: "test", modules: [] } };
    expect(session.modelCache).toEqual({ archModel: { name: "test", modules: [] } });
  });

  it("different sessions have independent model caches", () => {
    const sessionA = app.createSession("/project-a");
    const sessionB = app.createSession("/project-b");

    sessionA.modelCache = { archModel: { name: "project-a" } };
    sessionB.modelCache = { archModel: { name: "project-b" } };

    expect(sessionA.modelCache).toEqual({ archModel: { name: "project-a" } });
    expect(sessionB.modelCache).toEqual({ archModel: { name: "project-b" } });
  });

  it("releasing a session clears its model cache", () => {
    const session = app.createSession("/project");
    session.modelCache = { archModel: { name: "test" } };

    app.releaseSession("/project");
    expect(app.getSession("/project")).toBeUndefined();
  });

  it("shutdown clears all model caches", () => {
    app.createSession("/project-a");
    app.createSession("/project-b");
    app.shutdown();
    expect(app.getSession("/project-a")).toBeUndefined();
    expect(app.getSession("/project-b")).toBeUndefined();
  });
});
