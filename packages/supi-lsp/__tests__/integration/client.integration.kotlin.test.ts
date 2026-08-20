// Integration tests — LspClient against kotlin-lsp for real Kotlin LSP.
// Requires kotlin-lsp and gradle on PATH (kotlin-lsp imports the fixture
// project through the installed Gradle).
//
// Covers the ticket's Kotlin contract: the built-in configuration starts
// kotlin-lsp with `--stdio`, the server statically advertises
// `diagnosticProvider`, and a real `textDocument/diagnostic` pull round-trip
// confirms the fixture's type error.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
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

// The built-in Kotlin server definition, read from defaults.json so the test
// exercises the actual shipped configuration (args must include `--stdio`).
const defaultsPath = fileURLToPath(new URL("../../src/config/defaults.json", import.meta.url));
const defaults = JSON.parse(fs.readFileSync(defaultsPath, "utf-8")) as {
  servers: Record<string, ServerConfig>;
};

const KOTLIN_CONFIG: ServerConfig = defaults.servers.kotlin;

const HAS_KOTLIN = hasCommand("kotlin-lsp") && hasCommand("gradle");

// ── Fixture Setup ─────────────────────────────────────────────────────

let tmpDir: string;
let badFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-kotlin-integration-"));

  // kotlin-lsp imports the project through Gradle; a proper minimal project
  // is required for analysis (a bare .kt file is never analyzed).
  fs.writeFileSync(path.join(tmpDir, "settings.gradle.kts"), 'rootProject.name = "kotlinprobe"\n');
  fs.writeFileSync(
    path.join(tmpDir, "build.gradle.kts"),
    'plugins {\n    kotlin("jvm") version "2.2.0"\n}\n',
  );
  const srcDir = path.join(tmpDir, "src", "main", "kotlin");
  fs.mkdirSync(srcDir, { recursive: true });

  badFile = path.join(srcDir, "Main.kt");
  fs.writeFileSync(badFile, 'fun main() {\n    val x: Int = "not a number"\n    println(x)\n}\n');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_KOTLIN)("LspClient integration (kotlin-lsp)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("starts through the built-in configuration with --stdio", async () => {
    expect(KOTLIN_CONFIG.command).toBe("kotlin-lsp");
    expect(KOTLIN_CONFIG.args).toEqual(["--stdio"]);

    client = new LspClient("kotlin", KOTLIN_CONFIG, tmpDir);
    // kotlin-lsp is a JVM server with a slow cold start and a Gradle import.
    // Under full-suite load other test processes starve this JVM, so keep a
    // generous budget well above isolation-run times.
    await client.start();
    expect(client.status).toBe("running");
  }, 240_000);

  it("observes the static diagnosticProvider capability", () => {
    // With --stdio, kotlin-lsp statically advertises diagnosticProvider in
    // the initialize result, so the client enables pull diagnostics.
    expect(client.serverCapabilities?.diagnosticProvider).toBeDefined();
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("pulls diagnostics for a file with a type error", async () => {
    const content = fs.readFileSync(badFile, "utf-8");
    const result = await waitFor(
      () => client.syncAndWaitForDiagnostics(badFile, content),
      (diagnostics) => diagnostics.kind !== "unavailable" && diagnostics.data.length > 0,
      {
        timeoutMs: 240_000,
        retryDelayMs: 1_000,
        label: "pull diagnostics for Main.kt",
      },
    );
    const typeErrors = completedDiagnostics(result).filter((d: Diagnostic) => d.severity === 1);
    expect(typeErrors.length).toBeGreaterThan(0);
  }, 300_000);
});
