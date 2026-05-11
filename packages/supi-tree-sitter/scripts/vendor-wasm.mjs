#!/usr/bin/env node
/**
 * Vendors Tree-sitter grammar WASM files from their installed npm packages
 * into the package's resources/ directory.
 *
 * Grammars whose npm packages ship pre-built WASM files are copied directly.
 * Kotlin and SQL are handled by dedicated generator scripts because their
 * npm packages do not include WASM files.
 *
 * Usage:
 *   node scripts/vendor-wasm.mjs           # Copy WASM files
 *   node scripts/vendor-wasm.mjs --check   # Verify checksums
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const resourcesDir = path.join(packageRoot, "resources", "grammars");
const checkMode = process.argv.includes("--check");

/**
 * Map: grammarId → { npmPackage, wasmFile }
 * Only grammars whose npm packages ship .wasm files belong here.
 * Kotlin and SQL use dedicated generator scripts (generate-kotlin-wasm.mjs,
 * generate-sql-wasm.mjs) because their packages do not include WASM.
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

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readPackage(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return {
    dir: path.dirname(packageJsonPath),
    json: JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")),
  };
}

function vendorGrammar(grammarId, source) {
  const pkg = readPackage(source.npmPackage);
  const srcWasmPath = path.join(pkg.dir, source.wasmFile);

  if (!fs.existsSync(srcWasmPath)) {
    throw new Error(
      `WASM file not found in ${source.npmPackage} at ${srcWasmPath}. ` +
        `Ensure the package is installed (pnpm install) and ships a .wasm file.`,
    );
  }

  const grammarDir = path.join(resourcesDir, grammarId);
  const destWasmPath = path.join(grammarDir, source.wasmFile);
  const metadataPath = path.join(grammarDir, `${source.wasmFile}.json`);

  fs.mkdirSync(grammarDir, { recursive: true });
  fs.copyFileSync(srcWasmPath, destWasmPath);

  const checksum = sha256(destWasmPath);
  const metadata = {
    source: {
      npmPackage: source.npmPackage,
      version: pkg.json.version,
    },
    sha256: checksum,
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  process.stdout.write(
    `${grammarId}: ${source.wasmFile} (${source.npmPackage} ${pkg.json.version}, ${checksum})\n`,
  );
}

function checkGrammar(grammarId, source) {
  const grammarDir = path.join(resourcesDir, grammarId);
  const wasmPath = path.join(grammarDir, source.wasmFile);
  const metadataPath = path.join(grammarDir, `${source.wasmFile}.json`);
  const errors = [];

  if (!fs.existsSync(wasmPath)) {
    errors.push(`${grammarId}: missing vendored WASM at ${wasmPath}`);
    return errors;
  }
  if (!fs.existsSync(metadataPath)) {
    errors.push(`${grammarId}: missing metadata at ${metadataPath}`);
    return errors;
  }

  try {
    const pkg = readPackage(source.npmPackage);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    const actualSha = sha256(wasmPath);

    if (metadata.source?.npmPackage !== source.npmPackage) {
      errors.push(`${grammarId}: metadata source npmPackage mismatch`);
    }
    if (metadata.source?.version !== pkg.json.version) {
      errors.push(
        `${grammarId}: metadata version ${metadata.source?.version} !== installed ${pkg.json.version}`,
      );
    }
    if (metadata.sha256 !== actualSha) {
      errors.push(`${grammarId}: metadata sha256 ${metadata.sha256} !== actual ${actualSha}`);
    }
  } catch (err) {
    errors.push(`${grammarId}: ${err.message}`);
  }

  return errors;
}

// Main
if (checkMode) {
  let allErrors = [];
  for (const [grammarId, source] of Object.entries(GRAMMAR_SOURCES)) {
    const errors = checkGrammar(grammarId, source);
    allErrors = allErrors.concat(errors);
  }

  if (allErrors.length > 0) {
    throw new Error(
      `Vendored WASM checks failed:\n- ${allErrors.join("\n- ")}\nRun: node scripts/vendor-wasm.mjs`,
    );
  }
  process.stdout.write("All vendored WASM files are current.\n");
} else {
  for (const [grammarId, source] of Object.entries(GRAMMAR_SOURCES)) {
    vendorGrammar(grammarId, source);
  }
  process.stdout.write("All vendored WASM files generated.\n");
}
