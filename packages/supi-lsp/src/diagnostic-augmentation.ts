import * as path from "node:path";
import type { LspManager } from "./manager.ts";
import type { Diagnostic, Hover, MarkedString, MarkupContent } from "./types.ts";

const AUGMENT_TIMEOUT_MS = 500;

/**
 * Augment diagnostics with LSP hover and code_actions at the first severity-1 error.
 * Silently returns null if LSP is unavailable, times out, or there are no errors.
 */
export async function augmentDiagnostics(
  filePath: string,
  diags: Diagnostic[],
  manager: LspManager,
  _cwd: string,
): Promise<string | null> {
  const firstError = diags.find((d) => d.severity === 1);
  if (!firstError) return null;

  const resolvedPath = path.resolve(filePath);
  const client = await manager.getClientForFile(filePath);
  if (!client) return null;

  const pos = firstError.range.start;

  const [hoverResult, codeActionsResult] = await Promise.all([
    withTimeout(client.hover(resolvedPath, pos), AUGMENT_TIMEOUT_MS),
    withTimeout(
      client.codeActions(resolvedPath, { start: pos, end: pos }, { diagnostics: [firstError] }),
      AUGMENT_TIMEOUT_MS,
    ),
  ]);

  const parts: string[] = [];

  if (hoverResult) {
    const hoverText = formatHoverForDiagnostics(hoverResult);
    if (hoverText) parts.push(`💡 Hover info:\n${hoverText}`);
  }

  if (codeActionsResult && codeActionsResult.length > 0) {
    const titles = codeActionsResult.map((a) => a.title).join(", ");
    parts.push(`💡 Available fix: ${titles}`);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Extract raw hover text for inline diagnostic augmentation.
 * Intentionally strips markdown code-block framing (unlike formatHover)
 * to keep augmentation concise and readable inside diagnostic output.
 */
function formatHoverForDiagnostics(hover: Hover): string {
  const contents = hover.contents;
  let text = "";

  if (typeof contents === "string") {
    text = contents;
  } else if ("value" in contents) {
    const mc = contents as MarkupContent | { language: string; value: string };
    if ("kind" in mc) text = mc.value;
    else text = mc.value;
  } else if (Array.isArray(contents)) {
    text = (contents as MarkedString[])
      .map((c) => (typeof c === "string" ? c : c.value))
      .join("\n");
  }

  const lines = text.split("\n").slice(0, 3);
  return lines.join("\n");
}

async function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timer) clearTimeout(timer);
  return result;
}
