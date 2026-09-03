#!/usr/bin/env node

import { join } from "node:path";
import { checkGeneratedWasm } from "./wasm-checks.mjs";
import {
  GENERATE_ALL_WASM_COMMAND,
  generateWasmArtifact,
  isMain,
  packageRoot,
  runScript,
} from "./wasm-utils.mjs";

const SOURCE_PACKAGE = "tree-sitter-kotlin";
const WASM_FILE = "tree-sitter-kotlin.wasm";
const grammarDir = join(packageRoot, "resources", "grammars", "kotlin");
const artifacts = {
  wasmPath: join(grammarDir, WASM_FILE),
  metadataPath: join(grammarDir, `${WASM_FILE}.json`),
};
const USAGE = `Usage: node scripts/generate-kotlin-wasm.mjs [--check]

Build or check the vendored Kotlin Tree-sitter WASM file.

Options:
  --check  Check metadata and the vendored file without rebuilding
  --help   Show this help`;

function expectedReleaseAsset(version) {
  return `https://github.com/fwcd/tree-sitter-kotlin/releases/download/${version}/tree-sitter-kotlin.wasm`;
}

/** Check the vendored Kotlin WASM against source and generator metadata. */
export function checkKotlinWasm() {
  checkGeneratedWasm({
    displayName: "Kotlin Tree-sitter WASM",
    sourcePackageName: SOURCE_PACKAGE,
    artifacts,
    staleCommand: GENERATE_ALL_WASM_COMMAND,
    additionalMetadataChecks: ({ sourcePackage }) => [
      {
        path: "source.releaseAsset",
        expected: expectedReleaseAsset(sourcePackage.json.version),
        message: "metadata release asset URL does not match the installed package version",
      },
    ],
  });
}

/** Build the Kotlin grammar and publish its WASM and metadata artifacts. */
export function generateKotlinWasm() {
  const { checksum } = generateWasmArtifact({
    sourcePackageName: SOURCE_PACKAGE,
    projectName: SOURCE_PACKAGE,
    wasmFile: WASM_FILE,
    artifacts,
    tempPrefix: "supi-kotlin-wasm-",
    createMetadata: ({ sourcePackage, cliPackage, sha256 }) => ({
      source: {
        npmPackage: SOURCE_PACKAGE,
        version: sourcePackage.json.version,
        repository: "https://github.com/fwcd/tree-sitter-kotlin",
        releaseAsset: expectedReleaseAsset(sourcePackage.json.version),
      },
      generatedWith: {
        treeSitterCli: cliPackage.json.version,
      },
      sha256,
    }),
  });

  process.stdout.write(`Generated ${artifacts.wasmPath}\nSHA256 ${checksum}\n`);
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) {
      checkKotlinWasm();
    } else {
      generateKotlinWasm();
    }
  });
}
