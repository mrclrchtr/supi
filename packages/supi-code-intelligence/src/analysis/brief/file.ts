/**
 * File-level brief generation with provider enrichment.
 *
 * Generates a brief for a single source file, enriching with outline, imports,
 * exports, diagnostics, and entrypoint-detection metadata.
 *
 * Extracted from brief-focused.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { renderFileBrief } from "../../ui/markdown/brief.ts";
import type { ArchitectureModel } from "../architecture/model.ts";
import { findModuleForPath } from "../architecture/model.ts";
import { gatherBriefEnrichment } from "./enrich.ts";
import type { BriefOpts } from "./models.ts";

/** Generate a file-level brief with structural enrichment and diagnostics. */
export async function generateFileBrief(
  model: ArchitectureModel,
  resolvedPath: string,
  opts?: BriefOpts,
): Promise<{
  content: string;
  publicSurfaces: string[];
  nextQueries: string[];
}> {
  const mod = findModuleForPath(model, resolvedPath);
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  const fileName = path.basename(resolvedPath);
  const relPath = path.relative(model.root, resolvedPath);

  let lineCount = 0;
  try {
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    lineCount = fileContent.split("\n").length;
  } catch {
    // Leave 0
  }

  const isEntrypoint =
    mod?.entrypoints.some((ep) => path.resolve(mod.root, ep) === resolvedPath) ?? false;

  const lspService =
    opts?.lspService ??
    ({
      kind: "unavailable" as const,
      reason: "No LSP service",
    } as import("@mrclrchtr/supi-lsp/api").SessionLspServiceState);
  const enrichment = await gatherBriefEnrichment(
    opts?.provider ?? null,
    relPath,
    opts?.maxResults,
    lspService,
  );

  const renderedContent = renderFileBrief({
    relPath: relPath || fileName,
    lineCount,
    isEntrypoint,
    moduleName: mod ? mod.name.replace(/^@[^/]+\//, "") : null,
    moduleRelativePath: mod ? mod.relativePath : null,
    enrichment,
    maxResults: opts?.maxResults,
  });

  if (isEntrypoint) {
    const shortName = mod?.name.replace(/^@[^/]+\//, "") ?? "";
    publicSurfaces.push(`${shortName} entrypoint`);
  }

  nextQueries.push(
    `\`code_graph\`, \`file: "${relPath}"\`, and a line/character for reference sites`,
  );
  if (mod) {
    nextQueries.push(
      `\`code_orientation\` with \`focus: "${mod.relativePath}"\` for the containing module overview`,
    );
  }

  return { content: renderedContent, publicSurfaces, nextQueries };
}
