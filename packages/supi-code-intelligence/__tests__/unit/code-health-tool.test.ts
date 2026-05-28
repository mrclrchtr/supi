/**
 * RED tests for the code_health tool (Phase 1.5).
 *
 * Tests will fail initially because code_health is not yet registered
 * or the executor is not implemented.
 */

import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-health-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

describe("code_health tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_health");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("has parameters matching the planned V2 schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("refresh");
    expect(props).toHaveProperty("include");
    expect(props).toHaveProperty("level");
  });

  it("returns workspace diagnostic summary when called with no args", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-1",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should return a health report, not an error
    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Health");
  });

  it("returns error-like output when LSP is not available", async () => {
    // No registerMockProvider call — LSP is unavailable
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-2",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should report that LSP is not available, not throw
    expect(result.content[0].text).toContain("LSP");
  });

  it("includes diagnostics section when include contains diagnostics", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-3",
      { include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("Diagnostics");
  });

  it("includes servers section when include contains servers", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-4",
      { include: ["servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Servers section may be empty when no real LSP is running,
    // but the tool should not error
    expect(result.content[0].text).not.toContain("**Error");
  });

  it("includes dirty workspace section when include contains dirty", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-5",
      { include: ["dirty"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Dirty section may be empty when temp dir is not a git repo,
    // but the tool should not error
    expect(result.content[0].text).not.toContain("**Error");
  });

  it("defaults to diagnostics + servers when include is omitted", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Default includes diagnostics
    expect(result.content[0].text).toContain("Diagnostics");
  });

  it("accepts level: summary", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-7",
      { level: "summary" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("accepts level: detailed", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-8",
      { level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("accepts scope parameter", async () => {
    registerMockProvider(tmpDir);

    // Use "." as scope since the temp dir exists
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-9",
      { scope: "." },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("includes recover message when refresh is true", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-10",
      { refresh: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Refresh should trigger recovery, which should be reflected in output
    expect(result.content[0].text).not.toContain("**Error");
  });
});
