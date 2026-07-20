import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";

let cwd: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  getDefaultWorkspaceRuntime().clearAll();
  if (cwd) rmSync(cwd, { recursive: true, force: true });
  cwd = undefined;
});

describe("Capability Warning startup notice", () => {
  it("uses the canonical message identifier and copy after the grace period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    cwd = mkdtempSync(join(tmpdir(), "supi-ci-capability-warning-"));
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const ctx = makeCtx({ cwd });

    const sessionStart = pi.getHandlers("session_start")[0];
    expect(sessionStart).toBeDefined();
    await sessionStart?.({ reason: "startup" }, ctx);
    vi.advanceTimersByTime(5_001);

    const results: unknown[] = [];
    const event = { systemPromptOptions: { contextFiles: [] } };
    for (const handler of pi.getHandlers("before_agent_start")) {
      results.push(await handler(event, ctx));
    }
    const result = results.find(
      (candidate) =>
        (candidate as { message?: { customType?: string } } | undefined)?.message?.customType ===
        "code-intelligence-capability-warnings",
    ) as
      | {
          message?: { customType?: string; content?: string };
          systemPrompt?: string;
        }
      | undefined;

    expect(result?.message?.customType).toBe("code-intelligence-capability-warnings");
    expect(result?.message?.content).toContain("Code intelligence Capability Warnings:");
    expect(result?.systemPrompt).toContain("reports Capability Warnings");
    expect(result?.systemPrompt).not.toContain("degraded coverage");
  });
});
