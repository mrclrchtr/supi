// Unit tests for server-requested workspace diagnostic refresh handling.

import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticEvidenceSummary } from "../../src/diagnostics/evidence.ts";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing the private request handler at its protocol boundary
type AnyClient = any;

const REFRESH_METHOD = "workspace/diagnostic/refresh";

function evidenceSummary(): DiagnosticEvidenceSummary {
  return {
    requested: 2,
    confirmed: 1,
    unconfirmed: 0,
    failed: 1,
    removed: 0,
    documents: [
      { file: "src/private.py", status: "confirmed" },
      { file: "src/failed.py", status: "failed" },
    ],
  };
}

async function flushRefresh(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  resetDebugRegistry();
  configureDebugRegistry({ enabled: true, maxEvents: 20 });
});

afterEach(() => {
  resetDebugRegistry();
});

describe("LSP server-requested diagnostic refresh", () => {
  it("returns null immediately and records aggregate success after the refresh", async () => {
    const { client } = createRunningTestClient();
    const refresh = vi.spyOn(client, "refreshOpenDiagnostics").mockResolvedValue(evidenceSummary());

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    await flushRefresh();
    expect(refresh).toHaveBeenCalledWith();

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.refresh-request",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        level: "debug",
        message: "LSP diagnostic refresh request completed",
        cwd: "/project",
        data: {
          outcome: "completed",
          server: "test",
          requested: 2,
          confirmed: 1,
          unconfirmed: 0,
          failed: 1,
          removed: 0,
        },
      }),
    ]);
    expect(events[0]?.data).not.toHaveProperty("documents");
    expect(JSON.stringify(events)).not.toContain("private.py");
  });

  it("consumes a rejected refresh and records one failure event", async () => {
    const { client } = createRunningTestClient();
    vi.spyOn(client, "refreshOpenDiagnostics").mockRejectedValue(
      new Error("private diagnostic failure"),
    );

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.refresh-request",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh request failed",
        cwd: "/project",
        data: { outcome: "failed", server: "test" },
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("private diagnostic failure");
  });

  it("does not send pull requests when no documents are tracked", async () => {
    const { client, rpc } = createRunningTestClient();

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toEqual([
      expect.objectContaining({
        data: {
          outcome: "completed",
          server: "test",
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
        },
      }),
    ]);
  });

  it("does not send pull requests when the client is not operational", async () => {
    const { client, rpc } = createRunningTestClient();
    client.didOpen("/project/tracked.ts", "const tracked = true;\n");
    (client as AnyClient)._status = "error";

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toHaveLength(1);
  });
});
