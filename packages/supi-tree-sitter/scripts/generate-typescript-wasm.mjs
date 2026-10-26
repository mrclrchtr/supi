#!/usr/bin/env node

/** Build TypeScript and TSX with checked source-grammar fixes; runtime uses only vendored WASM. */
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { checkCopiedFile, checkGeneratedWasm } from "./wasm-checks.mjs";
import {
  GENERATE_ALL_WASM_COMMAND,
  generateWasmArtifact,
  isMain,
  packageRoot,
  readInstalledPackage,
  readJson,
  runScript,
  runTreeSitterGenerate,
} from "./wasm-utils.mjs";

const SOURCE_PACKAGE = "tree-sitter-typescript";
const SOURCE_REPOSITORY = "https://github.com/tree-sitter/tree-sitter-typescript";
const PATCH_FILE = "common/define-grammar.js";
const PATCHES = [
  { id: "type-only-star-reexports-v1", file: PATCH_FILE },
  { id: "import-types-as-primary-types-v1", file: PATCH_FILE },
];
const DIALECTS = ["typescript", "tsx"];
const USAGE = `Usage: node scripts/generate-typescript-wasm.mjs [--check]

Build or check the patched TypeScript and TSX Tree-sitter WASM files.

Options:
  --check  Check metadata and vendored files without rebuilding
  --help   Show this help`;

function artifactsFor(dialect) {
  const directory = join(packageRoot, "resources", "grammars", dialect);
  const wasmFile = `tree-sitter-${dialect}.wasm`;
  return {
    wasmFile,
    wasmPath: join(directory, wasmFile),
    metadataPath: join(directory, `${wasmFile}.json`),
    licensePath: join(directory, "LICENSE"),
  };
}

function javascriptDependency() {
  const source = readInstalledPackage(SOURCE_PACKAGE);
  const require = createRequire(join(source.dir, "package.json"));
  const metadata = require.resolve("tree-sitter-javascript/package.json");
  return { dir: dirname(metadata), json: readJson(metadata) };
}

/** Validate both dialects against the pinned source, dependency, patch, CLI, and WASM checksums. */
export function checkTypescriptWasm() {
  const source = readInstalledPackage(SOURCE_PACKAGE);
  const javascript = javascriptDependency();
  for (const dialect of DIALECTS) {
    const artifacts = artifactsFor(dialect);
    checkGeneratedWasm({
      displayName: `${dialect} Tree-sitter WASM`,
      sourcePackageName: SOURCE_PACKAGE,
      artifacts,
      staleCommand: GENERATE_ALL_WASM_COMMAND,
      additionalMetadataChecks: () => [
        {
          path: "source.repository",
          expected: SOURCE_REPOSITORY,
          message: "source repository mismatch",
        },
        {
          path: "source.dependencies.tree-sitter-javascript",
          expected: javascript.json.version,
          message: "JavaScript grammar dependency mismatch",
        },
        ...PATCHES.map((patch, index) => ({
          path: `patches.${index}.id`,
          expected: patch.id,
          message: `metadata must record ${patch.id}`,
        })),
        {
          path: "patches.length",
          expected: PATCHES.length,
          message: "grammar patch count mismatch",
        },
      ],
    });
    checkCopiedFile({
      displayName: `${dialect} Tree-sitter grammar license`,
      sourcePath: join(source.dir, "LICENSE"),
      vendoredPath: artifacts.licensePath,
      staleCommand: GENERATE_ALL_WASM_COMMAND,
    });
  }
}

/** Regenerate both dialects from installed upstream source without changing installed packages. */
export function generateTypescriptWasm() {
  const javascript = javascriptDependency();
  for (const dialect of DIALECTS) {
    const artifacts = artifactsFor(dialect);
    const { sourcePackage, checksum } = generateWasmArtifact({
      sourcePackageName: SOURCE_PACKAGE,
      projectName: SOURCE_PACKAGE,
      grammarSubdirectory: dialect,
      wasmFile: artifacts.wasmFile,
      artifacts,
      tempPrefix: `supi-${dialect}-wasm-`,
      prepare: (directory) => {
        patchTypescriptGrammar(directory);
        // Preserve the source package's own dependency under both hoisted and isolated installs.
        const dependency = join(directory, "node_modules", "tree-sitter-javascript");
        rmSync(dependency, { recursive: true, force: true });
        mkdirSync(dirname(dependency), { recursive: true });
        symlinkSync(javascript.dir, dependency, process.platform === "win32" ? "junction" : "dir");
      },
      generate: runTreeSitterGenerate,
      createMetadata: ({ sourcePackage, cliPackage, sha256 }) => ({
        source: {
          npmPackage: SOURCE_PACKAGE,
          version: sourcePackage.json.version,
          repository: SOURCE_REPOSITORY,
          dependencies: { "tree-sitter-javascript": javascript.json.version },
        },
        generatedWith: { treeSitterCli: cliPackage.json.version },
        patches: PATCHES,
        sha256,
      }),
    });
    copyFileSync(join(sourcePackage.dir, "LICENSE"), artifacts.licensePath);
    process.stdout.write(`Generated ${artifacts.wasmPath}\nSHA256 ${checksum}\n`);
  }
}

/** Fix shared source-form rules before generation; reject changed upstream patch inputs. */
export function patchTypescriptGrammar(directory) {
  const path = join(directory, PATCH_FILE);
  let source = readFileSync(path, "utf8");
  const before = `          $.export_clause,
          optional($._from_clause),`;
  const after = `          choice(
            seq(choice('*', $.namespace_export), $._from_clause),
            seq($.export_clause, optional($._from_clause)),
          ),`;
  source = replaceRule(source, before, after, "type-export");
  // array_type needs the complete import qualifier to be a primary type.
  const importTypes = `        prec(-1, alias($._type_query_member_expression_in_type_annotation, $.member_expression)),
        prec(-1, alias($._type_query_call_expression_in_type_annotation, $.call_expression)),
`;
  source = replaceRule(source, importTypes, "", "import-type alternatives");
  source = replaceRule(
    source,
    "      primary_type: $ => choice(\n",
    `      primary_type: $ => choice(\n${importTypes}`,
    "primary-type",
  );
  writeFileSync(path, source);
}

function replaceRule(source, before, after, name) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one upstream ${name} rule to patch; found ${count}.`);
  return source.replace(before, after);
}

if (isMain(import.meta.url)) {
  runScript(process.argv.slice(2), USAGE, ({ check }) => {
    if (check) checkTypescriptWasm();
    else generateTypescriptWasm();
  });
}
