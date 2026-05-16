import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Walk a staged package copy and rewrite all workspace-owned package.json
 * files into npm-compatible publish manifests.
 *
 * Uses pnpm's `createExportableManifest` to resolve workspace: protocol
 * references to concrete versions, then strips devDependencies from all
 * publishable manifests.
 *
 * Workspace detection relies on scanning `node_modules/@mrclrchtr/*` in the
 * staged directory, not on pnpm-workspace.yaml — the staged copy already has
 * the actual packages with real version metadata.
 */
/**
 * Rewrite a single staged package manifest using pnpm's exportable manifest
 * builder. Returns the cleaned manifest without devDependencies.
 */
async function rewriteOneManifest(pkgDir, raw) {
  const { createExportableManifest } = await import("@pnpm/exportable-manifest");
  const publishable = await createExportableManifest(pkgDir, raw, {
    catalogs: {},
  });

  // Remove devDependencies — private workspace test utilities shouldn't ship
  delete publishable.devDependencies;

  // Preserve bundledDependencies (may have been cleaned by exportable logic)
  if (raw.bundledDependencies && !publishable.bundledDependencies) {
    publishable.bundledDependencies = raw.bundledDependencies;
  }
  if (raw.bundleDependencies && !publishable.bundleDependencies) {
    publishable.bundleDependencies = raw.bundleDependencies;
  }

  return publishable;
}

/**
 * Walk a staged package copy and rewrite all workspace-owned package.json
 * files into npm-compatible publish manifests.
 *
 * Uses pnpm's `createExportableManifest` to resolve workspace: protocol
 * references to concrete versions, then strips devDependencies from all
 * publishable manifests.
 *
 * Workspace detection relies on scanning `node_modules/@mrclrchtr/*` in the
 * staged directory, not on pnpm-workspace.yaml — the staged copy already has
 * the actual packages with real version metadata.
 */
export async function rewriteStagedManifests(stageDir) {
  const packages = collectWorkspacePackageDirs(stageDir);

  for (const pkgDir of packages) {
    const manifestPath = join(pkgDir, "package.json");
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));

    // Skip non-workspace packages (external npm deps)
    if (
      !raw.name?.startsWith("@mrclrchtr/") ||
      !(typeof raw.version === "string" || raw.private === true)
    ) {
      continue;
    }

    let publishable;
    try {
      publishable = await rewriteOneManifest(pkgDir, raw);
    } catch (err) {
      throw new Error(
        `Failed to create exportable manifest for ${raw.name} at ${pkgDir}: ${err instanceof Error ? err.message : err}`,
        { cause: err },
      );
    }

    writeFileSync(manifestPath, `${JSON.stringify(publishable, null, 2)}\n`);
  }
}

/**
 * Scan a scoped-bundles directory of the form `node_modules/@mrclrchtr` for
 * valid sub-packages and return their full paths.
 *
 * Returns an empty array when the directory does not exist or is unreadable.
 */
function scanBundlesDir(bundlesDir) {
  const result = [];
  let entries;
  try {
    entries = readdirSync(bundlesDir);
  } catch {
    return result;
  }
  for (const entry of entries) {
    const pkgJson = join(bundlesDir, entry, "package.json");
    try {
      if (statSync(pkgJson).isFile()) {
        result.push(join(bundlesDir, entry));
      }
    } catch {
      // Not a readable package — skip
    }
  }
  return result;
}

/**
 * Collect all directories that contain a package.json belonging to
 * @mrclrchtr/* workspace packages inside the staged copy.
 *
 * This includes the top-level stage dir and any bundled copies under
 * node_modules/@mrclrchtr/* (including nested transitive bundles).
 */
function collectWorkspacePackageDirs(stageDir) {
  const dirs = [stageDir];

  // Collect top-level @mrclrchtr workspace bundles
  const topDir = join(stageDir, "node_modules", "@mrclrchtr");
  dirs.push(...scanBundlesDir(topDir));

  // Collect deeper nested bundles: node_modules/@mrclrchtr/*/node_modules/@mrclrchtr/*
  for (const parent of [...dirs]) {
    if (parent === stageDir) continue;
    const nested = join(parent, "node_modules", "@mrclrchtr");
    for (const sub of scanBundlesDir(nested)) {
      if (!dirs.includes(sub)) dirs.push(sub);
    }
  }

  return dirs;
}
