// Integration tests — LspClient against gopls for real Go LSP.
// Requires gopls on PATH.
//
// Covers the ticket's Gopls contract: the built-in default stays in push
// mode (no initializationOptions), and the documented
// `initializationOptions.pullDiagnostics: true` opt-in enables pull.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CodeQueryResult } from "@mrclrchtr/supi-code-runtime/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { Diagnostic, ServerConfig } from "../../src/config/types.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

function completedDiagnostics(result: CodeQueryResult<Diagnostic[]>): Diagnostic[] {
  expect(result.kind).toBe("completed");
  if (result.kind !== "completed") {
    throw new Error(`Expected completed diagnostics, got ${result.kind}.`);
  }
  return result.data;
}

const GO_PUSH_CONFIG: ServerConfig = {
  command: "gopls",
  args: ["serve"],
  fileTypes: ["go", "mod"],
  rootMarkers: ["go.mod", "go.sum"],
};

const GO_PULL_CONFIG: ServerConfig = {
  ...GO_PUSH_CONFIG,
  initializationOptions: { pullDiagnostics: true },
};

const HAS_GOPLS = hasCommand("gopls");

// ── Fixture Setup ─────────────────────────────────────────────────────

let tmpDir: string;
let badFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-go-integration-"));

  fs.writeFileSync(path.join(tmpDir, "go.mod"), "module goplsintegration\n\ngo 1.22\n");

  badFile = path.join(tmpDir, "main.go");
  fs.writeFileSync(
    badFile,
    // biome-ignore lint/security/noSecrets: fixture source code, not a secret
    'package main\n\nfunc main() {\n\tvar x int = "not a number"\n\tprintln(x)\n}\n',
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_GOPLS)("LspClient integration (gopls push default)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("starts in push mode with the built-in configuration", async () => {
    client = new LspClient("gopls", GO_PUSH_CONFIG, tmpDir);
    await client.start();
    expect(client.status).toBe("running");
    // Without pullDiagnostics in initializationOptions, gopls advertises no
    // diagnosticProvider and the client stays in push mode.
    expect(client.serverCapabilities?.diagnosticProvider).toBeUndefined();
    expect(client.hasDiagnosticProvider).toBe(false);
  }, 30_000);

  it("collects push diagnostics without pull requests", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    const result = await waitFor(
      () => client.syncAndWaitForDiagnostics(badFile, content),
      (diagnostics) => diagnostics.kind !== "unavailable" && diagnostics.data.length > 0,
      { timeoutMs: 20_000, retryDelayMs: 200, label: "push diagnostics for main.go" },
    );
    const typeErrors = completedDiagnostics(result).filter((d: Diagnostic) => d.severity === 1);
    expect(typeErrors.length).toBeGreaterThan(0);
  }, 30_000);
});

describe.skipIf(!HAS_GOPLS)("LspClient integration (gopls pull opt-in)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("advertises pull diagnostics with the pullDiagnostics opt-in", async () => {
    client = new LspClient("gopls", GO_PULL_CONFIG, tmpDir);
    await client.start();
    expect(client.status).toBe("running");
    expect(client.serverCapabilities?.diagnosticProvider).toBeDefined();
    expect(client.hasDiagnosticProvider).toBe(true);
  }, 30_000);

  it("collects pull diagnostics for a file with a type error", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    const result = await waitFor(
      () => client.syncAndWaitForDiagnostics(badFile, content),
      (diagnostics) => diagnostics.kind !== "unavailable" && diagnostics.data.length > 0,
      { timeoutMs: 30_000, retryDelayMs: 200, label: "pull diagnostics for main.go" },
    );
    const typeErrors = completedDiagnostics(result).filter((d: Diagnostic) => d.severity === 1);
    expect(typeErrors.length).toBeGreaterThan(0);
  }, 40_000);
});
