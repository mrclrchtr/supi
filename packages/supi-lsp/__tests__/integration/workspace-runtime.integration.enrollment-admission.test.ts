import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import {
  FileChangeType,
  LspRuntimeController,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { disabledDefaultServers } from "../helpers/disabled-default-servers.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");

interface ProtocolEvent {
  method: string;
  params?: { query?: string; textDocument?: { uri?: string; text?: string } };
}

describe("public WorkspaceLspRuntime enrollment admission", () => {
  let cwd: string;
  let seed: string;
  let cold: string;
  let logPath: string;
  let controller: LspRuntimeController;
  let runtime: WorkspaceLspRuntime;
  const pending: Promise<unknown>[] = [];

  function events(): ProtocolEvent[] {
    return fs
      .readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ProtocolEvent);
  }

  function release(): void {
    fs.writeFileSync(`${logPath}.release`, "");
  }

  function observe<T>(promise: Promise<T>): Promise<T> {
    pending.push(promise);
    void promise.catch(() => {});
    return promise;
  }

  beforeEach(async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-enrollment-admission-"));
    seed = path.join(cwd, "shared.tsx");
    cold = path.join(cwd, "cold.tsx");
    logPath = path.join(cwd, "protocol.log");
    fs.writeFileSync(logPath, "");
    release();
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(seed, "export function shared() {}\n");
    fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            ...disabledDefaultServers(cwd),
            fixture: {
              command: process.execPath,
              args: [
                FIXTURE,
                logPath,
                "1",
                "pull",
                "--workspace-symbol-open-files",
                "--hold-responses",
              ],
              fileTypes: ["tsx"],
              rootMarkers: ["project.marker"],
            },
          },
        },
      }),
    );
    controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") throw new Error(`Fixture did not start: ${started.kind}`);
    runtime = started.runtime;
    await expect(runtime.trackFile(seed)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({ kind: "ready" });
    fs.writeFileSync(cold, "export function cold() {}\n");
    fs.rmSync(`${logPath}.release`);
    fs.writeFileSync(logPath, "");
  });

  afterEach(async () => {
    if (logPath) release();
    await Promise.allSettled(pending.splice(0));
    await controller?.shutdown();
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
  });

  it.each(["abort", "deadline"] as const)(
    "preserves %s while empty symbol discovery waits to open a warm-up target",
    async (interruption) => {
      const active = observe(runtime.hover(seed, { line: 0, character: 16 }));
      await vi.waitFor(() =>
        expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1),
      );
      const caller = new AbortController();
      const control =
        interruption === "abort" ? { signal: caller.signal } : { deadline: Date.now() + 250 };
      const discovery = observe(runtime.workspaceSymbol("absent", control));
      const timer =
        interruption === "abort"
          ? setTimeout(() => caller.abort(new Error("warm-up cancelled")), 250)
          : undefined;
      try {
        await expect(discovery).rejects.toThrow(
          interruption === "abort" ? "warm-up cancelled" : "Code request deadline exceeded",
        );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
      release();
      await expect(active).resolves.toMatchObject({ kind: "completed" });
      expect(
        events().filter((event) => event.params?.textDocument?.uri?.endsWith("/cold.tsx")),
      ).toEqual([]);
    },
  );

  it("closes every waiting first access without resurrecting the document", async () => {
    const search = observe(runtime.workspaceSymbol("shared"));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(1),
    );
    const accesses = [
      observe(runtime.documentSymbols(cold)),
      observe(runtime.documentSymbols(cold)),
    ];
    // Routing to this already-ready client completes in the microtask queue.
    await new Promise<void>((resolve) => setImmediate(resolve));
    runtime.closeFile(cold);
    for (const access of accesses)
      await expect(access).resolves.toMatchObject({ kind: "unavailable" });
    release();
    await expect(search).resolves.toMatchObject({ kind: "completed" });
    expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
    expect(
      events().filter((event) => event.params?.textDocument?.uri?.endsWith("/cold.tsx")),
    ).toEqual([]);
  });

  it("rejects a queued document query when its already-open target closes", async () => {
    const active = observe(runtime.hover(seed, { line: 0, character: 16 }));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1),
    );
    const enrollment = observe(runtime.trackFile(cold));
    const queued = observe(runtime.documentSymbols(seed));
    await new Promise<void>((resolve) => setImmediate(resolve));
    runtime.closeFile(seed);
    await expect(queued).resolves.toMatchObject({ kind: "unavailable" });
    release();
    await expect(active).resolves.toMatchObject({ kind: "unavailable" });
    await expect(enrollment).resolves.toBe(true);
    expect(
      events().filter(
        (event) =>
          event.method === "textDocument/documentSymbol" &&
          event.params?.textDocument?.uri?.endsWith("/shared.tsx"),
      ),
    ).toEqual([]);
  });

  it("rejects queued positional evidence when known content changes during the wait", async () => {
    const active = observe(runtime.hover(seed, { line: 0, character: 16 }));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1),
    );
    const enrollment = observe(runtime.trackFile(cold));
    const queued = observe(runtime.hover(seed, { line: 0, character: 16 }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    fs.writeFileSync(seed, "// shifted declaration\nexport function shared() {}\n");
    await runtime.trackFile(seed);
    await expect(queued).resolves.toMatchObject({ kind: "unavailable" });
    release();
    await expect(active).resolves.toMatchObject({ kind: "unavailable" });
    await expect(enrollment).resolves.toBe(true);
    expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1);
  });

  it("invalidates first-access positions after a known change without cancelling ordinary tracking", async () => {
    const active = observe(runtime.hover(seed, { line: 0, character: 16 }));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1),
    );
    const positional = observe(runtime.hover(cold, { line: 0, character: 16 }));
    const tracking = observe(runtime.trackFile(cold));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const content = "// moved\nexport function cold() {}\n";
    fs.writeFileSync(cold, content);
    runtime.noteWorkspaceChanges([{ uri: fileToUri(cold), type: FileChangeType.Changed }]);
    await expect(positional).resolves.toMatchObject({ kind: "unavailable" });
    release();
    await expect(active).resolves.toMatchObject({ kind: "unavailable" });
    await expect(tracking).resolves.toBe(true);
    expect(events().filter((event) => event.method === "textDocument/hover")).toHaveLength(1);
    await vi.waitFor(() =>
      expect(
        events().find(
          (event) =>
            event.method === "textDocument/didOpen" &&
            event.params?.textDocument?.uri?.endsWith("/cold.tsx"),
        )?.params?.textDocument?.text,
      ).toBe(content),
    );
  });

  it("bounds waiting work, preserves abort reasons and admits new work after cancellation", async () => {
    const search = observe(runtime.workspaceSymbol("shared"));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(1),
    );
    const caller = new AbortController();
    const accesses = Array.from({ length: 33 }, () =>
      observe(runtime.documentSymbols(cold, { signal: caller.signal })),
    );
    await expect(Promise.race(accesses)).resolves.toMatchObject({ kind: "unavailable" });
    const reason = new Error("cancel waiting enrollment batch");
    caller.abort(reason);
    const outcomes = await Promise.allSettled(accesses);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(32);
    for (const outcome of outcomes)
      if (outcome.status === "rejected") expect(outcome.reason).toBe(reason);
    expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
    const fresh = observe(runtime.documentSymbols(cold));
    release();
    await expect(search).resolves.toMatchObject({ kind: "completed" });
    await expect(fresh).resolves.toMatchObject({ kind: "completed" });
    expect(
      events().filter(
        (event) =>
          event.method === "textDocument/didOpen" &&
          event.params?.textDocument?.uri?.endsWith("/cold.tsx"),
      ),
    ).toHaveLength(1);
  });

  it("releases queued work on shutdown without opening it on the retired client", async () => {
    const search = observe(runtime.workspaceSymbol("shared"));
    await vi.waitFor(() =>
      expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(1),
    );
    const access = observe(runtime.documentSymbols(cold));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const shutdown = controller.shutdown();
    await expect(access).resolves.toMatchObject({ kind: "unavailable" });
    await shutdown;
    await search;
    expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
    expect(
      events().filter((event) => event.params?.textDocument?.uri?.endsWith("/cold.tsx")),
    ).toEqual([]);
  });

  it.each(["documentSymbols", "fileDiagnostics"] as const)(
    "reads fresh content on %s admission before later searches can overtake it",
    async (operation) => {
      const search = observe(runtime.workspaceSymbol("shared"));
      await vi.waitFor(() =>
        expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(1),
      );
      const access = observe<unknown>(
        operation === "fileDiagnostics"
          ? runtime.fileDiagnostics(cold)
          : runtime.documentSymbols(cold),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      const freshContent = "export function cold() { return 42; }\n";
      fs.writeFileSync(cold, freshContent);
      const later = observe(runtime.workspaceSymbol("cold"));
      release();
      await expect(search).resolves.toMatchObject({ kind: "completed" });
      await expect(access).resolves.toMatchObject({ kind: "completed" });
      await expect(later).resolves.toMatchObject({ kind: "completed", data: [{ name: "cold" }] });
      const log = events();
      const opened = log.findIndex(
        (event) =>
          event.method === "textDocument/didOpen" &&
          event.params?.textDocument?.uri?.endsWith("/cold.tsx"),
      );
      expect(opened).toBeGreaterThanOrEqual(0);
      expect(log[opened].params?.textDocument?.text).toBe(freshContent);
      expect(
        log.findIndex(
          (event) => event.method === "workspace/symbol" && event.params?.query === "cold",
        ),
      ).toBeGreaterThan(opened);
    },
  );

  it.each(["documentSymbols", "fileDiagnostics"] as const)(
    "keeps searches parallel and expires waiting %s without opening the file",
    async (operation) => {
      const searches = [
        observe(runtime.workspaceSymbol("shared")),
        observe(runtime.workspaceSymbol("shared")),
      ];
      await vi.waitFor(() =>
        expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(2),
      );
      expect(runtime.getOpenDocumentVersion(cold)).toBeNull();

      const control = { deadline: Date.now() + 250 };
      const access = observe<unknown>(
        operation === "fileDiagnostics"
          ? runtime.fileDiagnostics(cold, undefined, control)
          : runtime.documentSymbols(cold, control),
      );
      await expect(access).rejects.toThrow("Code request deadline exceeded");
      expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
      release();
      for (const search of searches) {
        await expect(search).resolves.toMatchObject({
          kind: "completed",
          data: [{ name: "shared" }],
        });
      }
      expect(events().filter((event) => event.method === "workspace/symbol")).toHaveLength(2);
      expect(
        events().filter((event) => event.params?.textDocument?.uri?.endsWith("/cold.tsx")),
      ).toEqual([]);
    },
  );
});
