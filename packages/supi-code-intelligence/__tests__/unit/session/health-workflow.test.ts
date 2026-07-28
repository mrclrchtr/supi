import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import { runHealthWorkflow } from "../../../src/session/health-workflow.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "health-workflow-"));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "health-test" }));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function readyRuntime(
  servers: Array<{ status: string; ready: boolean }>,
): WorkspaceLspRuntimeState {
  return {
    kind: "ready",
    runtime: {
      getProjectServers: () =>
        servers.map((server) => ({
          name: "typescript",
          root: cwd,
          fileTypes: [".ts"],
          ...server,
        })),
    } as never,
  };
}

function capability(
  lspState: WorkspaceLspRuntimeState,
  semantic: CapabilityState,
): CapabilityAdapter {
  return {
    getLspRuntimeState: () => lspState,
    getCapabilityStates: () => ({
      semantic,
      structural: { kind: "unavailable", reason: "not configured" },
    }),
  } as unknown as CapabilityAdapter;
}

async function run(lspState: WorkspaceLspRuntimeState, semantic: CapabilityState) {
  return runHealthWorkflow(
    { include: ["servers"] },
    {
      cwd,
      capability: capability(lspState, semantic),
      lspController: { getMissingServers: () => [] } as never,
      lastRefresh: undefined,
      trackRefresh: () => undefined,
      sentinelSnapshot: new Map(),
    },
  );
}

describe("semantic health state", () => {
  it("lets a concrete ready project server override lagging pending publication", async () => {
    const outcome = await run(readyRuntime([{ status: "running", ready: true }]), {
      kind: "pending",
    });

    expect(outcome).toMatchObject({
      kind: "completed",
      data: { semanticState: { kind: "ready" } },
    });
  });

  it("reports pending when a ready runtime owner has no active ready server", async () => {
    const outcome = await run(readyRuntime([]), { kind: "pending" });

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        semanticState: {
          kind: "pending",
          reason: "No active, ready project servers",
        },
      },
    });
  });

  it.each([
    [
      "pending",
      { kind: "pending" } as const,
      { kind: "pending" } as const,
      { kind: "pending" as const },
    ],
    [
      "inactive",
      { kind: "inactive", runtime: {} as never } as const,
      { kind: "inactive" } as const,
      { kind: "inactive" as const },
    ],
    [
      "disabled",
      { kind: "disabled" } as const,
      { kind: "disabled" } as const,
      { kind: "disabled" as const },
    ],
    [
      "unavailable",
      { kind: "unavailable", reason: "server failed" } as const,
      { kind: "unavailable", reason: "server failed" } as const,
      { kind: "unavailable" as const, reason: "server failed" },
    ],
  ])("preserves the %s lifecycle branch", async (_label, lspState, semanticState, expected) => {
    const outcome = await run(lspState, semanticState);

    expect(outcome).toMatchObject({ kind: "completed", data: { semanticState: expected } });
  });
});
