import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Root directory of the supi-tree-sitter package. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Command that refreshes every vendored grammar artifact. */
export const GENERATE_ALL_WASM_COMMAND =
  "pnpm --filter @mrclrchtr/supi-tree-sitter generate:all-wasm";

/**
 * Parse the common command-line options used by the WASM maintenance scripts.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {{ check: boolean, help: boolean }} Parsed options.
 */
export function parseScriptArgs(argv) {
  let check = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--check") {
      if (check) {
        throw new Error("Option --check may be used only once");
      }
      check = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { check, help };
}

/**
 * Run a synchronous maintenance command and convert failures to a useful CLI
 * result. The function does not call process.exit, so cleanup handlers can run.
 *
 * @param {string[]} argv Arguments after the script name.
 * @param {string} usage Help text.
 * @param {(options: { check: boolean }) => void} action Command action.
 */
export function runScript(argv, usage, action) {
  try {
    const options = parseScriptArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }
    action({ check: options.check });
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}

/** Return true when a module is the process entry point. */
export function isMain(moduleUrl) {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(moduleUrl);
}

/**
 * Read an installed npm package and its package.json.
 *
 * @param {string} packageName npm package name.
 * @returns {{ dir: string, json: Record<string, unknown> }} Package details.
 */
export function readInstalledPackage(packageName) {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`);
  } catch (error) {
    throw new Error(
      `Cannot resolve installed package ${packageName}. Run pnpm install before running this script.`,
      { cause: error },
    );
  }

  let json;
  try {
    json = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read package metadata for ${packageName}.`, { cause: error });
  }

  if (!json || typeof json !== "object" || typeof json.version !== "string") {
    throw new Error(`Package metadata for ${packageName} has no valid version.`);
  }

  return { dir: dirname(packageJsonPath), json };
}

/** Calculate the SHA-256 checksum of one regular file. */
export function sha256(filePath) {
  assertFile(filePath, "WASM file");
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Read a JSON object with a path-aware error. */
export function readJson(filePath, description = "JSON file") {
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${description} at ${filePath}.`, { cause: error });
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must contain a JSON object: ${filePath}`);
  }
  return value;
}

/** Write formatted JSON with the repository's standard trailing newline. */
export function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Require a path to point to a regular file. */
export function assertFile(filePath, description) {
  let stats;
  try {
    stats = statSync(filePath);
  } catch (error) {
    throw new Error(`Missing ${description} at ${filePath}.`, { cause: error });
  }

  if (!stats.isFile()) {
    throw new Error(`${description} is not a regular file: ${filePath}`);
  }
}

function resolveTreeSitterCli(cliPackage) {
  const bin = cliPackage.json.bin;
  const entry = typeof bin === "string" ? bin : bin?.["tree-sitter"];
  if (typeof entry !== "string") {
    throw new Error("tree-sitter-cli does not declare a tree-sitter executable.");
  }

  const cliPath = resolve(cliPackage.dir, entry);
  assertFile(cliPath, "tree-sitter-cli executable");
  return cliPath;
}

function runTreeSitterBuild(cliPath, grammarDir) {
  const result = spawnSync(process.execPath, [cliPath, "build", "--wasm"], {
    cwd: grammarDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error("Could not start tree-sitter build.", { cause: result.error });
  }
  if (result.signal) {
    throw new Error(`tree-sitter build was terminated by ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(
      "tree-sitter build --wasm failed. Install Docker or Emscripten, then rerun the generator.",
    );
  }
}

function replaceFile(tempPath, destinationPath) {
  // Unix rename replaces an existing file. Windows requires the destination to
  // be removed first; both paths are on the same filesystem.
  if (process.platform === "win32") {
    rmSync(destinationPath, { force: true });
  }
  renameSync(tempPath, destinationPath);
}

/**
 * Publish a generated WASM file and its metadata through temporary siblings.
 * This prevents a failed copy or JSON write from truncating a tracked artifact.
 */
export function writeWasmArtifacts({ sourceWasmPath, artifacts, metadata }) {
  const { wasmPath, metadataPath } = artifacts;
  const outputDir = resolve(dirname(wasmPath));
  if (outputDir !== resolve(dirname(metadataPath))) {
    throw new Error("WASM and metadata artifacts must use the same directory.");
  }

  mkdirSync(outputDir, { recursive: true });
  const tempDir = mkdtempSync(join(outputDir, ".supi-wasm-"));
  const tempWasmPath = join(tempDir, basename(wasmPath));
  const tempMetadataPath = join(tempDir, basename(metadataPath));

  try {
    copyFileSync(sourceWasmPath, tempWasmPath);
    writeJson(tempMetadataPath, metadata);
    replaceFile(tempWasmPath, wasmPath);
    replaceFile(tempMetadataPath, metadataPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Build a grammar from an installed source package and publish its WASM file.
 *
 * @param {object} options Generator configuration.
 * @param {string} options.sourcePackageName Installed grammar package name.
 * @param {string} options.projectName Temporary Tree-sitter project name.
 * @param {string} options.wasmFile Generated WASM file name.
 * @param {{ wasmPath: string, metadataPath: string }} options.artifacts Destination paths.
 * @param {string} options.tempPrefix Temporary directory prefix.
 * @param {(grammarDir: string) => void} [options.prepare] Optional source edit.
 * @param {(details: { sourcePackage: object, cliPackage: object, sha256: string }) => object}
 *   options.createMetadata Metadata factory.
 * @returns {{ checksum: string, sourcePackage: object, cliPackage: object }} Build details.
 */
export function generateWasmArtifact({
  sourcePackageName,
  projectName,
  wasmFile,
  artifacts,
  tempPrefix,
  prepare,
  createMetadata,
}) {
  const sourcePackage = readInstalledPackage(sourcePackageName);
  const cliPackage = readInstalledPackage("tree-sitter-cli");
  const cliPath = resolveTreeSitterCli(cliPackage);
  const tempRoot = mkdtempSync(join(tmpdir(), tempPrefix));
  const grammarDir = join(tempRoot, projectName);

  try {
    cpSync(sourcePackage.dir, grammarDir, { recursive: true });
    prepare?.(grammarDir);
    runTreeSitterBuild(cliPath, grammarDir);

    const generatedWasmPath = join(grammarDir, wasmFile);
    assertFile(generatedWasmPath, "generated WASM file");
    const checksum = sha256(generatedWasmPath);
    const metadata = createMetadata({ sourcePackage, cliPackage, sha256: checksum });
    if (!metadata || typeof metadata !== "object") {
      throw new Error("The metadata factory did not return an object.");
    }

    writeWasmArtifacts({
      sourceWasmPath: generatedWasmPath,
      artifacts,
      metadata,
    });

    return { checksum, sourcePackage, cliPackage };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/** Format an unknown thrown value for a command-line error. */
export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Ensure a copied source package has the expected WASM input. */
export function assertSourceWasm(packageName, packageDir, wasmFile) {
  const sourceWasmPath = join(packageDir, wasmFile);
  if (!existsSync(sourceWasmPath)) {
    throw new Error(
      `WASM file not found in ${packageName} at ${sourceWasmPath}. ` +
        "Ensure the package is installed and ships a .wasm file.",
    );
  }
  assertFile(sourceWasmPath, "source WASM file");
  return sourceWasmPath;
}
