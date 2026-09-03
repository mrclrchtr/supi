#!/usr/bin/env node

/**
 * SQL Tree-sitter WASM generator.
 *
 * Rebuilds the vendored SQL grammar WASM from the @derekstride/tree-sitter-sql
 * npm package. This package is a devDependency only — the vendored WASM is the
 * sole runtime artifact. The npm package is never resolved at runtime.
 *
 * Trust considerations:
 * - The @derekstride/tree-sitter-sql install script uses "npx --yes", which
 *   some package managers flag as a supply-chain risk. This workspace disables
 *   that package's build script explicitly via pnpm `allowBuilds`.
 * - The WASM is built locally from the installed package source (not downloaded
 *   from npm). The build uses tree-sitter-cli with Emscripten/Docker.
 * - Alternatives considered: tree-sitter-sql (m-novikov, stale since 2021),
 *   tree-sitter-sql-bigquery (dialect-specific), and dialect-specific grammars.
 *   derekstride/tree-sitter-sql is the most mature general-purpose SQL grammar.
 *
 * Usage:
 *   pnpm --filter @mrclrchtr/supi-tree-sitter generate:sql-wasm
 *   pnpm --filter @mrclrchtr/supi-tree-sitter check:sql-wasm
 */

import { join } from "node:path";
import { checkGeneratedWasm } from "./wasm-checks.mjs";
import {
  GENERATE_ALL_WASM_COMMAND,
  generateWasmArtifact,
  isMain,
  packageRoot,
  readJson,
  runScript,
  writeJson,
} from "./wasm-utils.mjs";

const SOURCE_PACKAGE = "@derekstride/tree-sitter-sql";
const WASM_FILE = "tree-sitter-sql.wasm";
const grammarDir = join(packageRoot, "resources", "grammars", "sql");
const artifacts = {
  wasmPath: join(grammarDir, WASM_FILE),
  metadataPath: join(grammarDir, `${WASM_FILE}.json`),
};
const USAGE = `Usage: node scripts/generate-sql-wasm.mjs [--check]

Build or check the vendored SQL Tree-sitter WASM file.

Options:
  --check  Check metadata and the vendored file without rebuilding
  --help   Show this help`;

function prepareSqlGrammar(grammarDirPath) {
  // tree-sitter-cli requires a "tree-sitter" section in package.json.
  const grammarPackageJsonPath = join(grammarDirPath, "package.json");
  const grammarPackageJson = readJson(grammarPackageJsonPath, "SQL grammar package metadata");
  grammarPackageJson["tree-sitter"] = [{ scope: "source.sql" }];
  writeJson(grammarPackageJsonPath, grammarPackageJson);
}

/** Check the vendored SQL WASM against source and generator metadata. */
export function checkSqlWasm() {
  checkGeneratedWasm({
    displayName: "SQL Tree-sitter WASM",
    sourcePackageName: SOURCE_PACKAGE,
    artifacts,
    staleCommand: GENERATE_ALL_WASM_COMMAND,
  });
}

/** Build the SQL grammar and publish its WASM and metadata artifacts. */
export function generateSqlWasm() {
  const { checksum } = generateWasmArtifact({
    sourcePackageName: SOURCE_PACKAGE,
    projectName: "tree-sitter-sql",
    wasmFile: WASM_FILE,
    artifacts,
    tempPrefix: "supi-sql-wasm-",
    prepare: prepareSqlGrammar,
    createMetadata: ({ sourcePackage, cliPackage, sha256 }) => ({
      source: {
        npmPackage: SOURCE_PACKAGE,
        version: sourcePackage.json.version,
        repository: "https://github.com/derekstride/tree-sitter-sql",
      },
      generatedWith: {
        treeSitterCli: cliPackage.json.version,
      },
      sha256,
      trust: {
        note: "The @derekstride/tree-sitter-sql npm package is a devDependency only. It is never resolved at runtime; the vendored WASM above is the sole runtime artifact. This workspace explicitly disables the package's npx-based install script via pnpm allowBuilds. The WASM was built locally from the installed package source. See scripts/generate-sql-wasm.mjs for the rebuild procedure.",
        alternativesConsidered: [
          "tree-sitter-sql (m-novikov, 2021, stale)",
          "tree-sitter-sql-bigquery (BigQuery-specific)",
          "dialect-specific grammars (too narrow)",
        ],
      },
    }),
  });

  process.stdout.write(`Generated ${artifacts.wasmPath}\nSHA256 ${checksum}\n`);
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) {
      checkSqlWasm();
    } else {
      generateSqlWasm();
    }
  });
}
