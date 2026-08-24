import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPullTestClient, createRunningTestClient } from "../helpers/client-test-harness.ts";

let cwd = "";

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "lsp-diagnostic-timing-"));
  configureDebugRegistry({ enabled: true, maxEvents: 20 });
});

afterEach(() => {
  resetDebugRegistry();
  rmSync(cwd, { recursive: true, force: true });
});

describe("LSP diagnostic timing observations", () => {
  it("records a pull refresh with workspace identity but no source text", async () => {
    const file = join(cwd, "private-source.ts");
    writeFileSync(file, "const privateSource = true;\n");
    const { client, rpc } = createPullTestClient({ root: cwd, cwd });
    client.didOpen(file, "const privateSource = true;\n");
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 20 });

    const events = getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh-open completed",
        cwd,
        data: {
          operation: "refresh-open",
          collection: "pull",
          pull: "completed",
          push: "not-used",
          fallback: false,
          settle: "not-used",
          timedOut: false,
          freshness: "observed",
          documentCount: 1,
          outcome: "completed",
          server: "test",
          timing: {
            durationMs: expect.any(Number),
            phasesMs: {
              synchronize: expect.any(Number),
              pull: expect.any(Number),
            },
          },
        },
      }),
    ]);
    // refresh-open stays aggregate: no file identity in data.
    expect(events[0]?.data).not.toHaveProperty("file");
    expect(JSON.stringify(events)).not.toContain("privateSource");
  });

  it("records cache reuse for a fully reusable push-only refresh", async () => {
    const file = join(cwd, "cache-refresh.ts");
    writeFileSync(file, "const cacheRefresh = true;\n");
    const { client, rpc } = createRunningTestClient({ root: cwd, cwd });
    client.didOpen(file, "const cacheRefresh = true;\n");
    client.handlePublishDiagnostics({
      uri: `file://${file}`,
      version: client.getOpenDocumentVersion(file) ?? undefined,
      diagnostics: [],
    });
    rpc.sendNotification.mockClear();

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 20 });

    const event = getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0];
    expect(event).toEqual(
      expect.objectContaining({
        message: "LSP diagnostic refresh-open completed",
        cwd,
        data: {
          operation: "refresh-open",
          collection: "cache",
          pull: "not-used",
          push: "not-used",
          fallback: false,
          settle: "not-used",
          timedOut: false,
          freshness: "observed",
          documentCount: 1,
          outcome: "completed",
          server: "test",
          timing: {
            durationMs: expect.any(Number),
            phasesMs: {},
          },
        },
      }),
    );
    expect(event?.data).not.toHaveProperty("reopen");
    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("records pull fallback, push settle, and observed freshness", async () => {
    const file = join(cwd, "fallback.ts");
    writeFileSync(file, "const fallback = true;\n");
    const { client, rpc } = createPullTestClient({ root: cwd, cwd });
    client.didOpen(file, "const fallback = true;\n");
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));
    setTimeout(
      () =>
        client.handlePublishDiagnostics({
          uri: `file://${file}`,
          version: client.getOpenDocumentVersion(file) ?? undefined,
          diagnostics: [],
        }),
      10,
    );

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 20 });

    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual({
      operation: "refresh-open",
      collection: "fallback",
      pull: "failed",
      push: "settled",
      fallback: true,
      settle: "quiet",
      timedOut: false,
      freshness: "observed",
      documentCount: 1,
      outcome: "completed",
      server: "test",
      timing: {
        durationMs: expect.any(Number),
        phasesMs: {
          synchronize: expect.any(Number),
          pull: expect.any(Number),
          "push-settle": expect.any(Number),
        },
      },
    });
  });

  it("does not complete a multi-file refresh when one document has no fresh evidence", async () => {
    const first = join(cwd, "first.ts");
    const second = join(cwd, "second.ts");
    writeFileSync(first, "const first = true;\n");
    writeFileSync(second, "const second = true;\n");
    const { client, rpc } = createPullTestClient({ root: cwd, cwd });
    client.didOpen(first, "const first = true;\n");
    client.didOpen(second, "const second = true;\n");
    rpc.sendRequest.mockImplementation(
      (_method: string, params: { textDocument: { uri: string } }) =>
        params.textDocument.uri.endsWith("first.ts")
          ? Promise.resolve({ kind: "full", items: [] })
          : Promise.resolve({ kind: "unchanged", resultId: "unlinked" }),
    );

    await client.refreshOpenDiagnostics({ maxWaitMs: 80, quietMs: 20 });

    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        collection: "fallback",
        freshness: "observed",
        outcome: "timed-out",
      }),
    );
  });

  it("records push settle timeout separately from observed freshness", async () => {
    const file = join(cwd, "timeout.ts");
    writeFileSync(file, "const timeout = true;\n");
    const { client } = createRunningTestClient({ root: cwd, cwd });
    client.didOpen(file, "const timeout = true;\n");
    const interval = setInterval(
      () =>
        client.handlePublishDiagnostics({
          uri: `file://${file}`,
          version: client.getOpenDocumentVersion(file) ?? undefined,
          diagnostics: [],
        }),
      10,
    );

    try {
      await client.refreshOpenDiagnostics({ maxWaitMs: 80, quietMs: 30 });
    } finally {
      clearInterval(interval);
    }

    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        collection: "push",
        pull: "not-supported",
        push: "timed-out",
        fallback: false,
        settle: "timed-out",
        timedOut: true,
        freshness: "observed",
        outcome: "timed-out",
      }),
    );
  });

  it("does not classify waiter release as fresh push evidence", async () => {
    const file = join(cwd, "released.ts");
    writeFileSync(file, "const released = true;\n");
    const { client } = createRunningTestClient({ root: cwd, cwd });
    setTimeout(() => client.didClose(file), 10);

    await client.syncAndWaitForDiagnostics(file, "const released = true;\n");

    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        collection: "push",
        push: "released",
        settle: "released",
        timedOut: false,
        freshness: "not-observed",
        outcome: "incomplete",
      }),
    );
  });
  it("records single-file fallback publication as fresh diagnostic evidence", async () => {
    const file = join(cwd, "single.ts");
    writeFileSync(file, "const single = true;\n");
    const { client, rpc } = createPullTestClient({ root: cwd, cwd });
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));
    setTimeout(
      () =>
        client.handlePublishDiagnostics({
          uri: `file://${file}`,
          version: client.getOpenDocumentVersion(file) ?? undefined,
          diagnostics: [],
        }),
      10,
    );

    await client.syncAndWaitForDiagnostics(file, "const single = true;\n");

    const event = getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0];
    expect(event).toEqual(
      expect.objectContaining({
        cwd,
        data: expect.objectContaining({
          operation: "sync-file",
          server: "test",
          // The file identity is workspace-relative.
          file: "single.ts",
          collection: "fallback",
          pull: "failed",
          push: "published",
          fallback: true,
          settle: "published",
          timedOut: false,
          freshness: "observed",
          documentCount: 1,
          outcome: "completed",
        }),
      }),
    );
  });

  it("records the reopen-resync fallback count for a clean push-only file", async () => {
    const file = join(cwd, "reopen-timing.ts");
    writeFileSync(file, "const reopenTiming = true;\n");
    const { client } = createRunningTestClient({ root: cwd, cwd });
    client.didOpen(file, "const reopenTiming = true;\n");
    // A real disk change forces the didChange resynchronization whose clean
    // result stays unpublished until the fallback didOpen. Unchanged content
    // is retained without protocol work, so no reopen candidate would exist.
    writeFileSync(file, "const reopenTimingChanged = true;\n");
    // The server stays silent through the first settle window, then
    // publishes on the fallback didOpen.
    setTimeout(
      () => client.handlePublishDiagnostics({ uri: `file://${file}`, diagnostics: [] }),
      120,
    );

    await client.refreshOpenDiagnostics({ maxWaitMs: 80, quietMs: 20 });

    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        operation: "refresh-open",
        collection: "push",
        pull: "not-supported",
        reopen: 1,
        freshness: "observed",
        outcome: "completed",
        // The reopen mark names the preceding first settle window; the
        // final phase covers the reopen fallback and second settle.
        timing: expect.objectContaining({
          phasesMs: expect.objectContaining({
            synchronize: expect.any(Number),
            "first-settle": expect.any(Number),
            "push-settle": expect.any(Number),
          }),
        }),
      }),
    );
  });
});
