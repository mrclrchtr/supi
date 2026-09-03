import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkGeneratedWasm, checkVendoredWasm } from "../../scripts/wasm-checks.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptsDir = join(packageRoot, "scripts");
const commands = [
  "vendor-wasm.mjs",
  "generate-kotlin-wasm.mjs",
  "generate-sql-wasm.mjs",
  "check-all-wasm.mjs",
  "generate-all-wasm.mjs",
];

function runScript(script, ...args) {
  return spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
    encoding: "utf8",
  });
}

function copyArtifact(sourceWasmPath, sourceMetadataPath) {
  const directory = mkdtempSync(join(tmpdir(), "supi-wasm-check-"));
  const wasmPath = join(directory, "grammar.wasm");
  const metadataPath = join(directory, "grammar.wasm.json");
  copyFileSync(sourceWasmPath, wasmPath);
  writeFileSync(metadataPath, readFileSync(sourceMetadataPath));
  return { directory, artifacts: { wasmPath, metadataPath } };
}

describe("WASM maintenance scripts", () => {
  it.each(commands)("prints help for %s", (script) => {
    const result = runScript(script, "--help");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("--check");
    expect(result.stdout).toContain("--help");
  });

  it.each(commands)("rejects unknown options for %s", (script) => {
    const result = runScript(script, "--not-an-option");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown option");
  });

  it.each(["check-all-wasm.mjs", "generate-all-wasm.mjs"])(
    "checks every vendored grammar with %s",
    (script) => {
      const args = script === "generate-all-wasm.mjs" ? ["--check"] : [];
      const result = runScript(script, ...args);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("All Tree-sitter WASM artifacts are current.");
    },
    15_000,
  );

  it("reports a stale generated artifact with the all-artifacts command", () => {
    const fixture = copyArtifact(
      join(packageRoot, "resources/grammars/kotlin/tree-sitter-kotlin.wasm"),
      join(packageRoot, "resources/grammars/kotlin/tree-sitter-kotlin.wasm.json"),
    );
    try {
      const metadata = JSON.parse(readFileSync(fixture.artifacts.metadataPath, "utf8"));
      metadata.sha256 = "0".repeat(64);
      writeFileSync(fixture.artifacts.metadataPath, JSON.stringify(metadata));

      expect(() =>
        checkGeneratedWasm({
          displayName: "Kotlin Tree-sitter WASM",
          sourcePackageName: "tree-sitter-kotlin",
          artifacts: fixture.artifacts,
          staleCommand: "pnpm --filter @mrclrchtr/supi-tree-sitter generate:all-wasm",
        }),
      ).toThrow("generate:all-wasm");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("reports a stale copied artifact when source and vendored hashes differ", () => {
    const fixture = mkdtempSync(join(tmpdir(), "supi-wasm-vendor-check-"));
    const wasmPath = join(fixture, "grammar.wasm");
    const metadataPath = join(fixture, "grammar.wasm.json");
    try {
      writeFileSync(wasmPath, "not a grammar");
      writeFileSync(
        metadataPath,
        JSON.stringify({
          source: { npmPackage: "tree-sitter-javascript", version: "0.25.0" },
          sha256: "not-a-real-hash",
        }),
      );

      const errors = checkVendoredWasm({
        grammarId: "javascript",
        packageName: "tree-sitter-javascript",
        wasmFile: "tree-sitter-javascript.wasm",
        artifacts: { wasmPath, metadataPath },
      });

      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("vendored sha256")]));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
