import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEBUG_EVENT_ENTRY_TYPE, readSessionDebugEvents } from "../../src/session-events.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function writeSession(entries: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "supi-debug-"));
  tempDirs.push(dir);
  const file = join(dir, "session.jsonl");
  const header = {
    type: "session",
    version: 3,
    id: "019fc915-3ada-75bd-8ff8-bd32767de29f",
    timestamp: "2026-08-03T19:23:59.578Z",
    cwd: "/repo",
  };
  await writeFile(file, [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n"));
  return file;
}

describe("readSessionDebugEvents", () => {
  it("reports progress while scanning and stops on cancellation", async () => {
    const file = await writeSession([
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "debug",
          category: "scan",
          message: "first",
        },
      },
    ]);
    const progress: number[] = [];
    const controller = new AbortController();
    controller.abort();

    await expect(
      readSessionDebugEvents(
        file,
        {},
        {
          signal: controller.signal,
          onProgress: ({ scannedLines }) => progress.push(scannedLines),
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toEqual([]);
  });

  it("cancels when the final progress callback aborts the scan", async () => {
    const file = await writeSession([
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "debug",
          category: "scan",
          message: "first",
        },
      },
    ]);
    const controller = new AbortController();

    await expect(
      readSessionDebugEvents(
        file,
        {},
        {
          signal: controller.signal,
          onProgress: ({ scannedLines }) => {
            if (scannedLines === 2) controller.abort();
          },
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports final progress for a completed scan", async () => {
    const file = await writeSession([
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "debug",
          category: "scan",
          message: "first",
        },
      },
    ]);
    const progress: Array<{ scannedLines: number; matchedEvents: number }> = [];

    await readSessionDebugEvents(
      file,
      {},
      {
        onProgress: ({ scannedLines, matchedEvents }) =>
          progress.push({ scannedLines, matchedEvents }),
      },
    );

    expect(progress.at(-1)).toEqual({ scannedLines: 2, matchedEvents: 1 });
  });
  it("filters persisted entries, returns newest first, and never exposes raw data", async () => {
    const file = await writeSession([
      {
        type: "custom",
        id: "00000001",
        parentId: null,
        timestamp: "2026-08-03T19:24:00.000Z",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "first",
          data: { api_key: "secret" },
          rawData: { api_key: "secret" },
        },
      },
      {
        type: "custom",
        id: "00000002",
        parentId: "00000001",
        timestamp: "2026-08-03T19:25:00.000Z",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 2,
          timestamp: 1_700_000_001_000,
          source: "lsp",
          level: "error",
          category: "fallback",
          message: "second",
        },
      },
      {
        type: "custom",
        id: "00000003",
        parentId: "00000002",
        timestamp: "2026-08-03T19:26:00.000Z",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: { invalid: true },
      },
    ]);

    await expect(readSessionDebugEvents(file, { source: "lsp", limit: 1 })).resolves.toEqual({
      events: [
        {
          id: 2,
          timestamp: 1_700_000_001_000,
          source: "lsp",
          level: "error",
          category: "fallback",
          message: "second",
          cwd: undefined,
          data: undefined,
        },
      ],
      persistedEventCount: 3,
    });

    await expect(readSessionDebugEvents(file, { level: "warning" })).resolves.toEqual({
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "first",
          cwd: undefined,
          data: { api_key: "[REDACTED]" },
        },
      ],
      persistedEventCount: 3,
    });

    await expect(readSessionDebugEvents(file, { source: "review" })).resolves.toEqual({
      events: [],
      persistedEventCount: 3,
    });
  });

  it("retains and filters valid persisted Debug Operation IDs", async () => {
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    const file = await writeSession([
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "code-intelligence",
          level: "debug",
          category: "code-operation.start",
          message: "Code operation started",
          operationId,
        },
      },
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 2,
          timestamp: 1_700_000_001_000,
          source: "code-intelligence",
          level: "debug",
          category: "code-operation.finish",
          message: "Code operation finished",
          operationId: "raw-tool-call-id",
        },
      },
    ]);

    await expect(readSessionDebugEvents(file, { operationId })).resolves.toEqual({
      events: [expect.objectContaining({ id: 1, operationId })],
      persistedEventCount: 2,
    });
  });
});

describe("persisted LSP identity", () => {
  it("preserves identity fields unredacted while secret values stay redacted", async () => {
    const file = await writeSession([
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "debug",
          category: "request.timing",
          message: "LSP semantic request completed for textDocument/hover",
          cwd: "/home/user/workspace",
          data: {
            method: "textDocument/hover",
            methodClass: "semantic",
            outcome: "completed",
            server: "typescript",
            apiToken: "super-secret-value",
          },
        },
      },
      {
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 2,
          timestamp: 1_700_000_001_000,
          source: "lsp",
          level: "debug",
          category: "diagnostics.timing",
          message: "LSP diagnostic sync-file completed",
          cwd: "/home/user/workspace",
          data: {
            operation: "sync-file",
            file: "src/index.ts",
            server: "typescript",
            outcome: "completed",
          },
        },
      },
    ]);

    const result = await readSessionDebugEvents(file, { source: "lsp" });
    // Events sort newest-first: the diagnostics event precedes the request event.
    const [requestEvent, diagnosticsEvent] = [...result.events].reverse();
    // Identity fields pass through unredacted.
    expect(requestEvent).toMatchObject({
      cwd: "/home/user/workspace",
      data: {
        method: "textDocument/hover",
        server: "typescript",
        apiToken: "[REDACTED]",
      },
    });
    expect(diagnosticsEvent).toMatchObject({
      cwd: "/home/user/workspace",
      data: { file: "src/index.ts", server: "typescript" },
    });
    expect(result.persistedEventCount).toBe(2);
  });
});
