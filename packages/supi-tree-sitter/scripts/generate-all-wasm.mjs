#!/usr/bin/env node
/**
 * Generate every vendored Tree-sitter grammar WASM artifact.
 *
 * Use --check to validate every artifact without rebuilding it.
 */

import { checkAllWasm } from "./check-all-wasm.mjs";
import { generateKotlinWasm } from "./generate-kotlin-wasm.mjs";
import { generateSqlWasm } from "./generate-sql-wasm.mjs";
import { vendorWasm } from "./vendor-wasm.mjs";
import { isMain, runScript } from "./wasm-utils.mjs";

const USAGE = `Usage: node scripts/generate-all-wasm.mjs [--check]

Generate or check every vendored Tree-sitter WASM artifact.

Options:
  --check  Check files without rebuilding them
  --help   Show this help`;

/** Generate pre-built, Kotlin, and SQL Tree-sitter WASM artifacts. */
export function generateAllWasm() {
  vendorWasm();
  generateKotlinWasm();
  generateSqlWasm();
  process.stdout.write("All Tree-sitter WASM artifacts generated.\n");
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) {
      checkAllWasm();
    } else {
      generateAllWasm();
    }
  });
}
