import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledDefaultServers } from "../helpers/disabled-default-servers.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-refactor-admission-server.mjs");
const POSITION = { line: 0, character: 9 };

interface ProtocolEvent {
  method: string;
  phase: "request" | "response";
  params?: { textDocument?: { uri?: string } };
}

describe("public WorkspaceLspRuntime refactor admission", () => {
  let cwd: string;
  let seed: string;
  let cold: string;
  let logPath: string;
  let controller: LspRuntimeController;
  let runtime: WorkspaceLspRuntime;
  const pending: Promise<unknown>[] = [];

  function requests(method: string): ProtocolEvent[] {
    return fs
      .readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ProtocolEvent)
      .filter((event) => event.phase === "request" && event.method === method);
  }

  function release(): void {
    fs.writeFileSync(`${logPath}.release`, "");
  }

  function observe<T>(promise: Promise<T>): Promise<T> {
    pending.push(promise);
    void promise.catch(() => {});
    return promise;
  }

  async function start(heldMethod: string): Promise<void> {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refactor-admission-"));
    seed = path.join(cwd, "seed.test");
    cold = path.join(cwd, "cold.test");
    logPath = path.join(cwd, "protocol.log");
    fs.writeFileSync(logPath, "");
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(seed, "function oldName() {}\n");
    fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            ...disabledDefaultServers(cwd),
            fixture: {
              command: process.execPath,
              args: [FIXTURE, logPath, heldMethod],
              fileTypes: ["test"],
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
    fs.writeFileSync(cold, "function unrelated() {}\n");
    expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
    fs.writeFileSync(logPath, "");
  }

  afterEach(async () => {
    if (logPath) release();
    await Promise.allSettled(pending.splice(0));
    await controller?.shutdown();
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
  });

  it.each(["textDocument/prepareRename", "textDocument/rename", "codeAction/resolve"])(
    "keeps reads parallel but defers enrollment through %s and final acceptance",
    async (heldMethod) => {
      await start(heldMethod);
      const isCodeAction = heldMethod === "codeAction/resolve";
      const planning = observe<unknown>(
        isCodeAction
          ? runtime.codeActions(seed, { start: POSITION, end: POSITION }, undefined, {
              only: ["source.organizeImports"],
            })
          : runtime.rename(seed, POSITION, "newName"),
      );
      await vi.waitFor(() => expect(requests(heldMethod)).toHaveLength(1));
      await expect(runtime.hover(seed, POSITION)).resolves.toMatchObject({ kind: "completed" });
      const expired = observe(runtime.documentSymbols(cold, { deadline: Date.now() + 150 }));
      await expect(expired).rejects.toThrow("Code request deadline exceeded");
      expect(runtime.getOpenDocumentVersion(cold)).toBeNull();
      const access = observe(runtime.documentSymbols(cold));
      release();
      const edit = {
        changes: {
          [fileToUri(seed)]: [
            {
              newText: "newName",
              range: {
                start: { line: 0, character: 9 },
                end: { line: 0, character: 16 },
              },
            },
          ],
        },
      };
      await expect(planning).resolves.toMatchObject({
        value: isCodeAction ? [{ kind: "source.organizeImports", edit }] : edit,
      });
      await expect(access).resolves.toMatchObject({ kind: "completed" });
      expect(requests(heldMethod)).toHaveLength(1);
    },
  );

  it.each(["abort", "deadline", "content", "close", "shutdown"] as const)(
    "discards a waiting rename on %s without dispatching its original parameters",
    async (interruption) => {
      await start("textDocument/hover");
      const active = observe(runtime.hover(seed, POSITION));
      await vi.waitFor(() => expect(requests("textDocument/hover")).toHaveLength(1));
      const enrollment = observe(runtime.documentSymbols(cold));
      const caller = new AbortController();
      const control =
        interruption === "deadline" ? { deadline: Date.now() + 150 } : { signal: caller.signal };
      const rename = observe(runtime.rename(seed, POSITION, "newName", control));
      // Routing on this ready client drains before invalidating the queued demand.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (interruption === "abort") {
        const reason = new Error("cancel queued rename");
        caller.abort(reason);
        await expect(rename).rejects.toBe(reason);
      } else if (interruption === "deadline") {
        await expect(rename).rejects.toThrow("Code request deadline exceeded");
      } else {
        switch (interruption) {
          case "close":
            runtime.closeFile(seed);
            break;
          case "content":
            fs.writeFileSync(seed, "// shifted\nfunction oldName() {}\n");
            await expect(runtime.trackFile(seed)).resolves.toBe(true);
            break;
          case "shutdown":
            await controller.shutdown();
            break;
        }
        await expect(rename).resolves.toMatchObject({ value: null, reason: expect.any(String) });
      }
      release();
      await Promise.allSettled([active, enrollment]);
      expect(requests("textDocument/prepareRename")).toEqual([]);
      expect(requests("textDocument/rename")).toEqual([]);
    },
  );

  it.each(["content", "close"] as const)(
    "still rejects an active rename after %s invalidation",
    async (change) => {
      await start("textDocument/rename");
      const rename = observe(runtime.rename(seed, POSITION, "newName"));
      await vi.waitFor(() => expect(requests("textDocument/rename")).toHaveLength(1));
      if (change === "close") runtime.closeFile(seed);
      else {
        fs.writeFileSync(seed, "function badName() {}\n");
        await expect(runtime.trackFile(seed)).resolves.toBe(true);
      }
      release();
      await expect(rename).resolves.toMatchObject({
        value: null,
        reason: expect.stringContaining("Semantic input changed"),
      });
      expect(requests("textDocument/rename")).toHaveLength(1);
    },
  );
});
