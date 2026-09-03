#!/usr/bin/env node
/**
 * Check every vendored Tree-sitter grammar WASM artifact.
 *
 * Use this command in CI and before publishing. It checks both files copied
 * from npm packages and files generated from grammar source.
 */

import { checkKotlinWasm } from "./generate-kotlin-wasm.mjs";
import { checkSqlWasm } from "./generate-sql-wasm.mjs";
import { checkWasm } from "./vendor-wasm.mjs";
import { formatError, isMain, runScript } from "./wasm-utils.mjs";

const USAGE = `Usage: node scripts/check-all-wasm.mjs

Check every vendored Tree-sitter WASM artifact.

Options:
  --check  Check files (checking is the default)
  --help   Show this help`;

/** Check pre-built, Kotlin, and SQL Tree-sitter WASM artifacts. */
export function checkAllWasm() {
  const checks = [
    ["pre-built grammars", checkWasm],
    ["Kotlin", checkKotlinWasm],
    ["SQL", checkSqlWasm],
  ];
  const errors = [];

  for (const [name, check] of checks) {
    try {
      check();
    } catch (error) {
      errors.push(`${name}: ${formatError(error)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Tree-sitter WASM checks failed:\n\n${errors.join("\n\n")}`);
  }
  process.stdout.write("All Tree-sitter WASM artifacts are current.\n");
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, () => {
    checkAllWasm();
  });
}
