#!/usr/bin/env node

/**
 * Vendor Tree-sitter grammar WASM files from installed npm packages.
 *
 * Grammars whose npm packages ship pre-built WASM files are copied directly.
 * Kotlin and SQL are handled by the dedicated generator scripts.
 *
 * Usage:
 *   node scripts/vendor-wasm.mjs           # Copy WASM files
 *   node scripts/vendor-wasm.mjs --check   # Verify checksums
 *   node scripts/vendor-wasm.mjs --help    # Show all options
 */

import { join } from "node:path";
import { checkVendoredWasm } from "./wasm-checks.mjs";
import {
  assertSourceWasm,
  GENERATE_ALL_WASM_COMMAND,
  isMain,
  packageRoot,
  readInstalledPackage,
  runScript,
  sha256,
  writeWasmArtifacts,
} from "./wasm-utils.mjs";

const resourcesDir = join(packageRoot, "resources", "grammars");
const USAGE = `Usage: node scripts/vendor-wasm.mjs [--check]

Copy or check pre-built Tree-sitter grammar WASM files.

Options:
  --check  Check vendored files against installed npm packages
  --help   Show this help`;

/**
 * Map: grammar ID → source package and WASM file.
 * Kotlin and SQL are built by their dedicated generator scripts.
 */
const GRAMMAR_SOURCES = {
  javascript: { npmPackage: "tree-sitter-javascript", wasmFile: "tree-sitter-javascript.wasm" },
  typescript: { npmPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-typescript.wasm" },
  tsx: { npmPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-tsx.wasm" },
  python: { npmPackage: "tree-sitter-python", wasmFile: "tree-sitter-python.wasm" },
  rust: { npmPackage: "tree-sitter-rust", wasmFile: "tree-sitter-rust.wasm" },
  go: { npmPackage: "tree-sitter-go", wasmFile: "tree-sitter-go.wasm" },
  c: { npmPackage: "tree-sitter-c", wasmFile: "tree-sitter-c.wasm" },
  cpp: { npmPackage: "tree-sitter-cpp", wasmFile: "tree-sitter-cpp.wasm" },
  java: { npmPackage: "tree-sitter-java", wasmFile: "tree-sitter-java.wasm" },
  ruby: { npmPackage: "tree-sitter-ruby", wasmFile: "tree-sitter-ruby.wasm" },
  bash: { npmPackage: "tree-sitter-bash", wasmFile: "tree-sitter-bash.wasm" },
  html: { npmPackage: "tree-sitter-html", wasmFile: "tree-sitter-html.wasm" },
  r: { npmPackage: "@davisvaughan/tree-sitter-r", wasmFile: "tree-sitter-r.wasm" },
};

function artifactPaths(grammarId, wasmFile) {
  const grammarDir = join(resourcesDir, grammarId);
  return {
    wasmPath: join(grammarDir, wasmFile),
    metadataPath: join(grammarDir, `${wasmFile}.json`),
  };
}

function vendorGrammar(grammarId, source) {
  const sourcePackage = readInstalledPackage(source.npmPackage);
  const sourceWasmPath = assertSourceWasm(source.npmPackage, sourcePackage.dir, source.wasmFile);
  const artifacts = artifactPaths(grammarId, source.wasmFile);
  const checksum = sha256(sourceWasmPath);

  writeWasmArtifacts({
    sourceWasmPath,
    artifacts,
    metadata: {
      source: {
        npmPackage: source.npmPackage,
        version: sourcePackage.json.version,
      },
      sha256: checksum,
    },
  });

  process.stdout.write(
    `${grammarId}: ${source.wasmFile} (${source.npmPackage} ${sourcePackage.json.version}, ${checksum})\n`,
  );
}

/** Copy every pre-built grammar WASM file and refresh its metadata. */
export function vendorWasm() {
  for (const [grammarId, source] of Object.entries(GRAMMAR_SOURCES)) {
    vendorGrammar(grammarId, source);
  }
  process.stdout.write("All pre-built Tree-sitter WASM files generated.\n");
}

/** Check every pre-built grammar against its installed npm package. */
export function checkWasm() {
  const allErrors = [];
  for (const [grammarId, source] of Object.entries(GRAMMAR_SOURCES)) {
    const artifacts = artifactPaths(grammarId, source.wasmFile);
    allErrors.push(
      ...checkVendoredWasm({
        grammarId,
        packageName: source.npmPackage,
        wasmFile: source.wasmFile,
        artifacts,
      }),
    );
  }

  if (allErrors.length > 0) {
    throw new Error(
      `Pre-built Tree-sitter WASM checks failed:\n- ${allErrors.join("\n- ")}\nRun: ${GENERATE_ALL_WASM_COMMAND}`,
    );
  }
  process.stdout.write("All pre-built Tree-sitter WASM files are current.\n");
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) {
      checkWasm();
    } else {
      vendorWasm();
    }
  });
}
