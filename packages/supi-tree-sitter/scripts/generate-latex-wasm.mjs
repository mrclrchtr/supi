#!/usr/bin/env node

/**
 * Generate the vendored LaTeX Tree-sitter WASM file.
 *
 * The @pfoerster/tree-sitter-latex package is a devDependency only. This
 * script builds its source with the pinned workspace tree-sitter-cli; runtime
 * users only load the vendored WASM file.
 *
 * Usage:
 *   pnpm --filter @mrclrchtr/supi-tree-sitter generate:latex-wasm
 *   pnpm --filter @mrclrchtr/supi-tree-sitter check:latex-wasm
 */

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkCopiedFile, checkGeneratedWasm } from "./wasm-checks.mjs";
import {
  GENERATE_ALL_WASM_COMMAND,
  generateWasmArtifact,
  isMain,
  packageRoot,
  readInstalledPackage,
  runScript,
  runTreeSitterGenerate,
} from "./wasm-utils.mjs";

const SOURCE_PACKAGE = "@pfoerster/tree-sitter-latex";
const SOURCE_REPOSITORY = "https://github.com/latex-lsp/tree-sitter-latex";
const WASM_FILE = "tree-sitter-latex.wasm";
const LICENSE_FILE = "LICENSE";
const PATCH_ID = "label-underscore-v1";
const UPSTREAM_LABEL_RULE = String.raw`label: $ => /[^\\\[\]\{\}\$\(\)=&%\s_\^\#\~,]+/`;
const PATCHED_LABEL_RULE = String.raw`label: $ => /[^\\\[\]\{\}\$\(\)=&%\s\^\#\~,]+/`;
const grammarDir = join(packageRoot, "resources", "grammars", "latex");
const licensePath = join(grammarDir, LICENSE_FILE);
const artifacts = {
  wasmPath: join(grammarDir, WASM_FILE),
  metadataPath: join(grammarDir, `${WASM_FILE}.json`),
};
const USAGE = `Usage: node scripts/generate-latex-wasm.mjs [--check]

Build or check the vendored LaTeX Tree-sitter WASM file.

Options:
  --check  Check metadata and the vendored file without rebuilding
  --help   Show this help`;

/** Check the vendored LaTeX WASM against its installed source and metadata. */
export function checkLatexWasm() {
  checkGeneratedWasm({
    displayName: "LaTeX Tree-sitter WASM",
    sourcePackageName: SOURCE_PACKAGE,
    artifacts,
    staleCommand: GENERATE_ALL_WASM_COMMAND,
    additionalMetadataChecks: () => [
      {
        path: "source.repository",
        expected: SOURCE_REPOSITORY,
        message: `metadata repository must be ${SOURCE_REPOSITORY}`,
      },
      {
        path: "patches.0.id",
        expected: PATCH_ID,
        message: `metadata must record the ${PATCH_ID} grammar patch`,
      },
    ],
  });
  const sourcePackage = readInstalledPackage(SOURCE_PACKAGE);
  checkCopiedFile({
    displayName: "LaTeX Tree-sitter grammar license",
    sourcePath: join(sourcePackage.dir, LICENSE_FILE),
    vendoredPath: licensePath,
    staleCommand: GENERATE_ALL_WASM_COMMAND,
  });
}

/** Build the LaTeX grammar and publish its WASM and metadata artifacts. */
export function generateLatexWasm() {
  const { checksum, sourcePackage } = generateWasmArtifact({
    sourcePackageName: SOURCE_PACKAGE,
    projectName: "tree-sitter-latex",
    wasmFile: WASM_FILE,
    artifacts,
    tempPrefix: "supi-latex-wasm-",
    prepare: patchLatexGrammar,
    generate: runTreeSitterGenerate,
    createMetadata: ({ sourcePackage, cliPackage, sha256 }) => ({
      source: {
        npmPackage: SOURCE_PACKAGE,
        version: sourcePackage.json.version,
        repository: SOURCE_REPOSITORY,
      },
      generatedWith: {
        treeSitterCli: cliPackage.json.version,
      },
      patches: [{ id: PATCH_ID, file: "grammar.js" }],
      sha256,
    }),
  });
  copyFileSync(join(sourcePackage.dir, LICENSE_FILE), licensePath);

  process.stdout.write(`Generated ${artifacts.wasmPath}\nSHA256 ${checksum}\n`);
}

/**
 * Allow underscores in LaTeX label names before generating the parser.
 * @param {string} grammarDir Directory with the upstream grammar.js file.
 */
export function patchLatexGrammar(grammarDir) {
  const grammarPath = join(grammarDir, "grammar.js");
  const grammar = readFileSync(grammarPath, "utf8");
  const count = grammar.split(UPSTREAM_LABEL_RULE).length - 1;
  if (count !== 1) {
    throw new Error(`Expected one upstream label rule to patch; found ${count}.`);
  }
  writeFileSync(grammarPath, grammar.replace(UPSTREAM_LABEL_RULE, PATCHED_LABEL_RULE));
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) {
      checkLatexWasm();
    } else {
      generateLatexWasm();
    }
  });
}
