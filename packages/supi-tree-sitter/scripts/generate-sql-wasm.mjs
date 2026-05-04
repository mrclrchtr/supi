#!/usr/bin/env node
/**
 * SQL Tree-sitter WASM generator
 *
 * Rebuilds the vendored SQL grammar WASM from the @derekstride/tree-sitter-sql
 * npm package. This package is a devDependency ONLY — the vendored WASM is the
 * sole runtime artifact. The npm package is never resolved at runtime.
 *
 * Trust considerations:
 * - The @derekstride/tree-sitter-sql install script uses "npx --yes", which
 *   some package managers flag as a supply-chain risk. pnpm ignores build
 *   scripts by default, so this script never runs during install.
 * - The WASM is built locally from the installed package source (not downloaded
 *   from npm). The build uses tree-sitter-cli 0.22.6 with Emscripten/Docker.
 * - Alternatives considered: tree-sitter-sql (m-novikov, stale since 2021),
 *   tree-sitter-sql-bigquery (dialect-specific), and dialect-specific grammars.
 *   derekstride/tree-sitter-sql is the most mature general-purpose SQL grammar.
 *
 * Usage:
 *   pnpm --filter @mrclrchtr/supi-tree-sitter generate:sql-wasm
 *   pnpm --filter @mrclrchtr/supi-tree-sitter check:sql-wasm
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const wasmDir = path.join(packageRoot, "resources", "grammars", "sql");
const wasmPath = path.join(wasmDir, "tree-sitter-sql.wasm");
const metadataPath = path.join(wasmDir, "tree-sitter-sql.wasm.json");
const checkMode = process.argv.includes("--check");

function readPackage(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return {
    dir: path.dirname(packageJsonPath),
    json: JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")),
  };
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readMetadata() {
  return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
}

function assertSqlWasmCurrent() {
  const sqlPackage = readPackage("@derekstride/tree-sitter-sql");
  const metadata = readMetadata();
  const actualSha = sha256(wasmPath);
  const errors = [];

  if (metadata.source?.npmPackage !== "@derekstride/tree-sitter-sql") {
    errors.push("metadata source package must be @derekstride/tree-sitter-sql");
  }
  if (metadata.source?.version !== sqlPackage.json.version) {
    errors.push(
      `metadata pins @derekstride/tree-sitter-sql ${metadata.source?.version}, but installed package is ${sqlPackage.json.version}`,
    );
  }
  if (metadata.sha256 !== actualSha) {
    errors.push(`metadata sha256 ${metadata.sha256} does not match vendored file ${actualSha}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Vendored SQL Tree-sitter WASM is stale:\n- ${errors.join("\n- ")}\nRun: pnpm --filter @mrclrchtr/supi-tree-sitter generate:sql-wasm`,
    );
  }

  process.stdout.write(
    `SQL Tree-sitter WASM is current (${sqlPackage.json.version}, ${actualSha}).\n`,
  );
}

function generateSqlWasm() {
  const sqlPackage = readPackage("@derekstride/tree-sitter-sql");
  const cliPackage = readPackage("tree-sitter-cli");
  const cliPath = path.join(cliPackage.dir, "cli.js");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-sql-wasm-"));
  const grammarDir = path.join(tempRoot, "tree-sitter-sql");

  try {
    fs.cpSync(sqlPackage.dir, grammarDir, { recursive: true });

    // tree-sitter-cli 0.22.6 requires a "tree-sitter" section in package.json
    const grammarPackageJsonPath = path.join(grammarDir, "package.json");
    const grammarPackageJson = JSON.parse(fs.readFileSync(grammarPackageJsonPath, "utf-8"));
    grammarPackageJson["tree-sitter"] = [{ scope: "source.sql" }];
    fs.writeFileSync(grammarPackageJsonPath, JSON.stringify(grammarPackageJson, null, 2));

    const result = spawnSync(process.execPath, [cliPath, "build", "--wasm"], {
      cwd: grammarDir,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(
        "tree-sitter build --wasm failed. Install Docker or Emscripten, then rerun generate:sql-wasm.",
      );
    }

    const generatedWasmPath = path.join(grammarDir, "tree-sitter-sql.wasm");
    if (!fs.existsSync(generatedWasmPath)) {
      throw new Error(`Expected generated WASM at ${generatedWasmPath}`);
    }

    fs.mkdirSync(wasmDir, { recursive: true });
    fs.copyFileSync(generatedWasmPath, wasmPath);

    const checksum = sha256(wasmPath);
    const metadata = {
      source: {
        npmPackage: "@derekstride/tree-sitter-sql",
        version: sqlPackage.json.version,
        repository: "https://github.com/derekstride/tree-sitter-sql",
      },
      generatedWith: {
        treeSitterCli: cliPackage.json.version,
      },
      sha256: checksum,
    };
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    process.stdout.write(`Generated ${wasmPath}\n`);
    process.stdout.write(`SHA256 ${checksum}\n`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (checkMode) {
  assertSqlWasmCurrent();
} else {
  generateSqlWasm();
}
