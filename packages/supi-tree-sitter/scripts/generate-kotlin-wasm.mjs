#!/usr/bin/env node

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
const wasmDir = path.join(packageRoot, "resources", "grammars", "kotlin");
const wasmPath = path.join(wasmDir, "tree-sitter-kotlin.wasm");
const metadataPath = path.join(wasmDir, "tree-sitter-kotlin.wasm.json");
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

function expectedReleaseAsset(version) {
  return `https://github.com/fwcd/tree-sitter-kotlin/releases/download/${version}/tree-sitter-kotlin.wasm`;
}

function assertKotlinWasmCurrent() {
  const kotlinPackage = readPackage("tree-sitter-kotlin");
  const metadata = readMetadata();
  const actualSha = sha256(wasmPath);
  const errors = [];

  if (metadata.source?.npmPackage !== "tree-sitter-kotlin") {
    errors.push("metadata source package must be tree-sitter-kotlin");
  }
  if (metadata.source?.version !== kotlinPackage.json.version) {
    errors.push(
      `metadata pins tree-sitter-kotlin ${metadata.source?.version}, but installed package is ${kotlinPackage.json.version}`,
    );
  }
  if (metadata.source?.releaseAsset !== expectedReleaseAsset(kotlinPackage.json.version)) {
    errors.push(
      "metadata release asset URL does not match the installed tree-sitter-kotlin version",
    );
  }
  if (metadata.sha256 !== actualSha) {
    errors.push(`metadata sha256 ${metadata.sha256} does not match vendored file ${actualSha}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Vendored Kotlin Tree-sitter WASM is stale:\n- ${errors.join("\n- ")}\nRun: pnpm --filter @mrclrchtr/supi-tree-sitter generate:kotlin-wasm`,
    );
  }

  process.stdout.write(
    `Kotlin Tree-sitter WASM is current (${kotlinPackage.json.version}, ${actualSha}).\n`,
  );
}

function generateKotlinWasm() {
  const kotlinPackage = readPackage("tree-sitter-kotlin");
  const cliPackage = readPackage("tree-sitter-cli");
  const cliPath = path.join(cliPackage.dir, "cli.js");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-kotlin-wasm-"));
  const grammarDir = path.join(tempRoot, "tree-sitter-kotlin");

  try {
    fs.cpSync(kotlinPackage.dir, grammarDir, { recursive: true });
    const result = spawnSync(process.execPath, [cliPath, "build", "--wasm"], {
      cwd: grammarDir,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(
        "tree-sitter build --wasm failed. Install Docker or Emscripten, then rerun generate:kotlin-wasm.",
      );
    }

    const generatedWasmPath = path.join(grammarDir, "tree-sitter-kotlin.wasm");
    if (!fs.existsSync(generatedWasmPath)) {
      throw new Error(`Expected generated WASM at ${generatedWasmPath}`);
    }

    fs.mkdirSync(wasmDir, { recursive: true });
    fs.copyFileSync(generatedWasmPath, wasmPath);

    const checksum = sha256(wasmPath);
    const metadata = {
      source: {
        npmPackage: "tree-sitter-kotlin",
        version: kotlinPackage.json.version,
        repository: "https://github.com/fwcd/tree-sitter-kotlin",
        releaseAsset: expectedReleaseAsset(kotlinPackage.json.version),
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
  assertKotlinWasmCurrent();
} else {
  generateKotlinWasm();
}
