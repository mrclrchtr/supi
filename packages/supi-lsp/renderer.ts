import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

interface LspContextDetails {
  contextToken?: string;
  inlineSeverity?: number;
  diagnostics?: Array<{
    file: string;
    errors: number;
    warnings: number;
    information: number;
    hints: number;
  }>;
}

type DiagnosticEntry = NonNullable<LspContextDetails["diagnostics"]>[number];
type DiagnosticCounts = Pick<DiagnosticEntry, "errors" | "warnings" | "information" | "hints">;

function formatDiagnosticCounts(
  totals: DiagnosticCounts,
  theme: { fg: (color: ThemeColor, text: string) => string },
): string {
  const parts: string[] = [];
  if (totals.errors > 0)
    parts.push(theme.fg("error", `${totals.errors} error${totals.errors === 1 ? "" : "s"}`));
  if (totals.warnings > 0)
    parts.push(
      theme.fg("warning", `${totals.warnings} warning${totals.warnings === 1 ? "" : "s"}`),
    );
  if (totals.information > 0)
    parts.push(
      theme.fg("accent", `${totals.information} info${totals.information === 1 ? "" : "s"}`),
    );
  if (totals.hints > 0)
    parts.push(theme.fg("dim", `${totals.hints} hint${totals.hints === 1 ? "" : "s"}`));
  return parts.join(", ");
}

function hasDiagnosticCounts(totals: DiagnosticCounts): boolean {
  return totals.errors > 0 || totals.warnings > 0 || totals.information > 0 || totals.hints > 0;
}

function buildLspContextCollapsed(
  diagnostics: LspContextDetails["diagnostics"],
  totals: DiagnosticCounts | undefined,
  theme: { fg: (color: ThemeColor, text: string) => string },
): string {
  const icon = theme.fg("accent", "\u{1F527}");
  if (!diagnostics || !totals) {
    return `${icon} LSP diagnostics injected`;
  }
  if (!hasDiagnosticCounts(totals)) {
    return `${icon} LSP diagnostics injected ${theme.fg("success", "\u2713")}`;
  }
  return `${icon} LSP diagnostics injected (${formatDiagnosticCounts(totals, theme)})`;
}

function formatFileDiagnosticEntry(d: DiagnosticCounts): string {
  return formatDiagnosticCounts(d, { fg: (_color, text) => text });
}

function formatExpandedDetails(
  diagnostics: LspContextDetails["diagnostics"],
  token: string | undefined,
  theme: { fg: (color: ThemeColor, text: string) => string },
): string {
  const lines: string[] = [];
  if (diagnostics && diagnostics.length > 0) {
    for (const d of diagnostics) {
      lines.push(theme.fg("dim", `  ${d.file}: ${formatFileDiagnosticEntry(d)}`));
    }
  }
  if (token) {
    lines.push(theme.fg("dim", `  token: ${token}`));
  }
  return lines.join("\n");
}

export type { LspContextDetails };

export function registerLspMessageRenderer(
  pi: import("@mariozechner/pi-coding-agent").ExtensionAPI,
): void {
  pi.registerMessageRenderer("lsp-context", (message, { expanded }, theme) => {
    const details = message.details as LspContextDetails | undefined;
    const diagnostics = details?.diagnostics;
    const token = details?.contextToken;

    const totals = diagnostics?.reduce(
      (acc, d) => ({
        errors: acc.errors + d.errors,
        warnings: acc.warnings + d.warnings,
        information: acc.information + d.information,
        hints: acc.hints + d.hints,
      }),
      { errors: 0, warnings: 0, information: 0, hints: 0 },
    );

    const collapsed = buildLspContextCollapsed(diagnostics, totals, theme);
    const expandedDetails = expanded ? formatExpandedDetails(diagnostics, token, theme) : "";
    const fullText = expandedDetails ? `${collapsed}\n${expandedDetails}` : collapsed;

    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(fullText, 0, 0));
    return box;
  });
}
