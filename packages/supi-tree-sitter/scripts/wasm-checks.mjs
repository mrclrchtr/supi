import { join } from "node:path";

import { formatError, readInstalledPackage, readJson, sha256 } from "./wasm-utils.mjs";

function metadataValue(metadata, keyPath) {
  return keyPath.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, metadata);
}

function readOptional(errors, label, read) {
  try {
    return read();
  } catch (error) {
    errors.push(`${label}: ${formatError(error)}`);
    return undefined;
  }
}

function commonMetadataChecks({ sourcePackageName, sourcePackage, cliPackage }) {
  return [
    {
      path: "source.npmPackage",
      expected: sourcePackageName,
      message: `metadata source package must be ${sourcePackageName}`,
    },
    {
      path: "source.version",
      expected: sourcePackage.json.version,
      message: `metadata pins ${sourcePackageName} ${sourcePackage.json.version}`,
    },
    {
      path: "generatedWith.treeSitterCli",
      expected: cliPackage.json.version,
      message: `metadata pins tree-sitter-cli ${cliPackage.json.version}`,
    },
  ];
}

function checkMetadata({
  displayName,
  sourcePackageName,
  metadata,
  sourcePackage,
  cliPackage,
  additionalMetadataChecks,
}) {
  try {
    const checks = [
      ...commonMetadataChecks({ sourcePackageName, sourcePackage, cliPackage }),
      ...(additionalMetadataChecks?.({ sourcePackage, cliPackage }) ?? []),
    ];
    return checks
      .filter((check) => metadataValue(metadata, check.path) !== check.expected)
      .map(
        (check) =>
          `${displayName}: ${check.message}; found ${JSON.stringify(metadataValue(metadata, check.path))}`,
      );
  } catch (error) {
    return [`${displayName}: ${formatError(error)}`];
  }
}

/**
 * Check one generated WASM artifact against installed package and CLI versions.
 *
 * @param {object} options Check configuration.
 * @param {string} options.displayName Human-readable artifact name.
 * @param {string} options.sourcePackageName Installed grammar package name.
 * @param {{ wasmPath: string, metadataPath: string }} options.artifacts Vendored paths.
 * @param {string} options.staleCommand Regeneration command for the error.
 * @param {(details: { sourcePackage: object, cliPackage: object }) => Array<object>}
 *   [options.additionalMetadataChecks] Extra metadata fields to compare.
 */
export function checkGeneratedWasm({
  displayName,
  sourcePackageName,
  artifacts,
  staleCommand,
  additionalMetadataChecks,
}) {
  const { wasmPath, metadataPath } = artifacts;
  const errors = [];
  const sourcePackage = readOptional(errors, displayName, () =>
    readInstalledPackage(sourcePackageName),
  );
  const cliPackage = readOptional(errors, displayName, () =>
    readInstalledPackage("tree-sitter-cli"),
  );
  const actualSha = readOptional(errors, displayName, () => sha256(wasmPath));
  const metadata = readOptional(errors, displayName, () =>
    readJson(metadataPath, `${displayName} metadata`),
  );

  if (sourcePackage && cliPackage && metadata) {
    errors.push(
      ...checkMetadata({
        displayName,
        sourcePackageName,
        metadata,
        sourcePackage,
        cliPackage,
        additionalMetadataChecks,
      }),
    );
  }
  if (metadata && actualSha && metadata.sha256 !== actualSha) {
    errors.push(
      `${displayName}: metadata sha256 ${metadata.sha256} does not match vendored file ${actualSha}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`${displayName} is stale:\n- ${errors.join("\n- ")}\nRun: ${staleCommand}`);
  }

  process.stdout.write(
    `${displayName} is current (${sourcePackage.json.version}, ${actualSha}).\n`,
  );
}

/**
 * Check a WASM file copied from an installed npm package.
 *
 * @param {{ grammarId: string, packageName: string, wasmFile: string,
 *   artifacts: { wasmPath: string, metadataPath: string } }} options Check configuration.
 * @returns {string[]} Human-readable errors. An empty array means current.
 */
export function checkVendoredWasm({ grammarId, packageName, wasmFile, artifacts }) {
  const { wasmPath, metadataPath } = artifacts;
  const errors = [];
  const sourcePackage = readOptional(errors, grammarId, () => readInstalledPackage(packageName));
  const sourceSha = sourcePackage
    ? readOptional(errors, grammarId, () => sha256(join(sourcePackage.dir, wasmFile)))
    : undefined;
  const actualSha = readOptional(errors, grammarId, () => sha256(wasmPath));
  const metadata = readOptional(errors, grammarId, () =>
    readJson(metadataPath, `${grammarId} metadata`),
  );

  if (sourcePackage && metadata) {
    if (metadata.source?.npmPackage !== packageName) {
      errors.push(`${grammarId}: metadata source npmPackage mismatch`);
    }
    if (metadata.source?.version !== sourcePackage.json.version) {
      errors.push(
        `${grammarId}: metadata version ${metadata.source?.version} !== installed ${sourcePackage.json.version}`,
      );
    }
  }
  if (actualSha && sourceSha && actualSha !== sourceSha) {
    errors.push(
      `${grammarId}: vendored sha256 ${actualSha} !== installed package source ${sourceSha}`,
    );
  }
  if (metadata && actualSha && metadata.sha256 !== actualSha) {
    errors.push(`${grammarId}: metadata sha256 ${metadata.sha256} !== vendored ${actualSha}`);
  }
  if (metadata && sourceSha && metadata.sha256 !== sourceSha) {
    errors.push(
      `${grammarId}: metadata sha256 ${metadata.sha256} !== installed package source ${sourceSha}`,
    );
  }

  return errors;
}
