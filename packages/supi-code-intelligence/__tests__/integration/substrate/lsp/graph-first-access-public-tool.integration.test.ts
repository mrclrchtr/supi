import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeGraphSpec } from "../../../../src/tool/code_graph/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { writeIsolatedFixtureConfig } from "../../../helpers/public-lsp-config.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../../../fixtures/lsp-graph-server.mjs");

interface ProtocolEvent {
  method: string;
  phase: "request" | "response";
  params?: { textDocument?: { uri?: string } };
}

function resultText(result: unknown): string {
  const { content } = result as { content: Array<{ type: string; text?: string }> };
  return content.map((item) => item.text ?? "").join("\n");
}

describe("registered public code_graph concurrent first access", () => {
  let cwd: string;
  let logPath: string;
  let controller: LspRuntimeController | undefined;
  const pendingCalls: Promise<unknown>[] = [];

  afterEach(async () => {
    if (logPath) {
      for (let attempt = 1; attempt <= 3; attempt++) release(attempt);
    }
    await Promise.allSettled(pendingCalls.splice(0));
    await controller?.shutdown();
    controller = undefined;
    if (cwd) {
      getDefaultWorkspaceRuntime().clearWorkspace(cwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
    resetDebugRegistry();
  });

  function release(attempt: number): void {
    fs.writeFileSync(`${logPath}.release-${attempt}`, "");
  }

  function referenceEvents(phase: ProtocolEvent["phase"]): ProtocolEvent[] {
    return fs
      .readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ProtocolEvent)
      .filter(
        (event) =>
          event.method === "textDocument/references" &&
          event.phase === phase &&
          event.params?.textDocument?.uri?.endsWith("/cold-a.test"),
      );
  }

  async function start() {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graph-first-access-"));
    logPath = path.join(cwd, "protocol.log");
    fs.writeFileSync(logPath, "");
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    const seed = path.join(cwd, "seed.test");
    fs.writeFileSync(seed, "function work() {}\nwork();\nwork();\n");
    writeIsolatedFixtureConfig(cwd, { args: [FIXTURE, logPath], fileTypes: ["test"] });
    resetDebugRegistry();
    configureDebugRegistry({ enabled: true, maxEvents: 500 });
    controller = new LspRuntimeController(cwd, getDefaultWorkspaceRuntime());
    const started = await controller.start();
    if (started.kind !== "ready") throw new Error(`Fixture did not start: ${started.kind}`);
    const runtime = started.runtime;
    await expect(runtime.trackFile(seed)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(seed)).resolves.toMatchObject({ kind: "ready" });
    const session = new WorkspaceCodeIntelligenceSession(cwd);
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeGraphSpec]);
    const graph = getTool(pi, "code_graph");
    return (name: string, signal?: AbortSignal) => {
      const file = path.join(cwd, `cold-${name}.test`);
      fs.writeFileSync(file, "function work() {}\nwork();\nwork();\n");
      expect(runtime.getOpenDocumentVersion(file)).toBeNull();
      const call = graph.execute(
        `graph-first-access-${name}`,
        { target: { anchor: { file, line: 1, character: 10 } }, relations: ["references"] },
        signal,
        undefined,
        makeCtx({ cwd }),
      );
      // Observe failures immediately while other public calls are still running.
      pendingCalls.push(call);
      void call.catch(() => {});
      return call;
    };
  }

  it("finishes parallel first accesses without invalidating held references and cancels a waiting caller", async () => {
    const graph = await start();
    const first = graph("a");
    await vi.waitFor(() => expect(referenceEvents("request")).toHaveLength(1));
    const others = ["b", "c", "d", "e", "f", "g", "h"].map((name) => graph(name));
    const caller = new AbortController();
    const cancelled = graph("cancelled", caller.signal);
    const timer = setTimeout(() => caller.abort(new Error("waiting Graph cancelled")), 150);
    try {
      await expect(cancelled).rejects.toThrow("waiting Graph cancelled");
    } finally {
      clearTimeout(timer);
    }
    release(1);
    for (const result of await Promise.all([first, ...others])) {
      expect(result).toMatchObject({ details: { type: "graph" } });
      expect(resultText(result)).toContain("L2:1");
      expect(resultText(result)).not.toContain("L3:1");
    }
    expect(referenceEvents("response")).toHaveLength(1);
    expect(referenceEvents("request")).toHaveLength(1);
    expect(getDebugEvents({ source: "lsp", category: "request.retry" }).events).toEqual([]);
  });
});
