// Code Intelligence status dialog — toggleable center overlay showing LSP + Tree-sitter
// status, expandable per-file diagnostics, and active code_* tool surface.

import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { BRAILLE_SPINNER_FRAMES } from "@mrclrchtr/supi-core/spinner-frames";
import type {
  Diagnostic,
  OutstandingDiagnosticSummaryEntry,
  ProjectServerInfo,
} from "@mrclrchtr/supi-lsp/api";
import type { CoverageWarningReport } from "../lsp/coverage-warnings.ts";
import { diagnosticMessageString } from "../lsp/diagnostic-utils.ts";

/**
 * Minimal theme contract used by the dialog. Matches the public `theme.fg()` /
 * `theme.bold()` shape exposed by `@earendil-works/pi-tui` — the full Theme
 * type is internal to pi-coding-agent and not re-exported.
 */
export interface CiDialogTheme {
  fg: (color: string, text: string) => string;
  bg?: (color: string, text: string) => string;
  bold: (text: string) => string;
}

export interface CiStatusData {
  servers: ProjectServerInfo[];
  /** Sorted: errors desc, then warnings desc, then info desc, then hints desc. */
  diagnostics: OutstandingDiagnosticSummaryEntry[];
  capabilities: {
    semantic: { kind: string; reason?: string; providerAvailable: boolean };
    structural: { kind: string; reason?: string; providerAvailable: boolean };
    refactorAvailable: boolean;
  };
  activeTools: string[];
  /** Coverage warnings for degraded semantic/structural substrate. Undefined when fully healthy. */
  degradedCoverage?: CoverageWarningReport;
}

/** Fetcher for full diagnostic details when a file row is expanded. */
export type DiagFetcher = (
  maxSeverity: number,
) =>
  | Array<{ file: string; diagnostics: Diagnostic[] }>
  | Promise<Array<{ file: string; diagnostics: Diagnostic[] }>>;

export interface CiStatusDialogDeps {
  theme: CiDialogTheme;
  done: () => void;
  tui: { requestRender: () => void };
  /** Async fetcher for full diagnostics on expand. Optional. */
  fetchDetailedDiagnostics?: DiagFetcher;
  /** Refresh callback — re-fetches data when 'r' is pressed. */
  onRefresh?: () => Promise<CiStatusData>;
}

const MAX_FILES_IN_LIST = 10;
const MAX_INLINE_MESSAGES = 5;
const MAX_OPEN_FILES_SHOWN = 3;
const SPINNER_INTERVAL_MS = 80;

export class CiStatusDialog {
  private selectedFileIdx = 0;
  private expandedFileIdx: number | null = null;
  private expandedDiagnostics: Diagnostic[] | null = null;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private loading = false;

  constructor(
    private data: CiStatusData,
    deps: CiStatusDialogDeps,
  ) {
    this.theme = deps.theme;
    this.done = deps.done;
    this.tui = deps.tui;
    this.fetchDetailedDiagnostics = deps.fetchDetailedDiagnostics;
    this.onRefresh = deps.onRefresh;
  }

  /** Called by pi-tui when the overlay is removed. */
  dispose(): void {
    this.stopSpinner();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => this.theme.fg("accent", s)));
    container.addChild(new Text(this.renderHeader(), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(new Text(this.renderSummaryLine(width), 1, 0));
    container.addChild(new Spacer(1));
    this.addServerSection(container);
    container.addChild(new Spacer(1));
    this.addProblemsSection(container, width);
    container.addChild(new Spacer(1));
    this.addCapabilitiesSection(container);
    this.addDegradedCoverageSection(container);
    this.addToolsSection(container, width);
    container.addChild(new Text(this.renderKeyHints(), 1, 0));
    container.addChild(new DynamicBorder((s: string) => this.theme.fg("accent", s)));

    const lines = container.render(width).map((line) => truncateToWidth(line, width));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single handler dispatching keyboard shortcuts
  handleInput(data: string): boolean {
    // ── Global actions ───────────────────────────────────────────────
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.escape)) {
      this.stopSpinner();
      this.done();
      return true;
    }

    if (data === "a") {
      this.expandedFileIdx = null;
      this.expandedDiagnostics = null;
      this.stopSpinner();
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    if (data === "r" && this.onRefresh) {
      void this.handleRefresh();
      return true;
    }

    // ── Navigation ───────────────────────────────────────────────────
    const fileCount = this.data.diagnostics.length;

    if ((matchesKey(data, Key.up) || data === "k") && this.selectedFileIdx > 0) {
      this.selectedFileIdx--;
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    if ((matchesKey(data, Key.down) || data === "j") && this.selectedFileIdx < fileCount - 1) {
      this.selectedFileIdx++;
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    if (
      (matchesKey(data, Key.enter) || matchesKey(data, Key.space) || data === " ") &&
      fileCount > 0
    ) {
      if (this.expandedFileIdx === this.selectedFileIdx) {
        this.expandedFileIdx = null;
        this.expandedDiagnostics = null;
        this.stopSpinner();
      } else {
        this.expandedFileIdx = this.selectedFileIdx;
        this.expandedDiagnostics = null;
        void this.loadDetailedDiagnostics();
      }
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    return false;
  }

  // ── Spinner ───────────────────────────────────────────────────────

  private startSpinner(): void {
    if (this.spinnerInterval) return;
    this.loading = true;
    this.spinnerFrame = 0;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % BRAILLE_SPINNER_FRAMES.length;
      this.invalidate();
      this.tui.requestRender();
    }, SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    this.loading = false;
  }

  // ── Async data loading ─────────────────────────────────────────────

  private async handleRefresh(): Promise<void> {
    if (!this.onRefresh) return;
    this.startSpinner();
    try {
      this.data = await this.onRefresh();
    } finally {
      this.stopSpinner();
    }
    this.selectedFileIdx = Math.min(
      this.selectedFileIdx,
      Math.max(0, this.data.diagnostics.length - 1),
    );
    this.expandedFileIdx = null;
    this.expandedDiagnostics = null;
    this.invalidate();
    this.tui.requestRender();
  }

  private async loadDetailedDiagnostics(): Promise<void> {
    if (!this.fetchDetailedDiagnostics || this.expandedFileIdx === null) return;
    const fileName = this.data.diagnostics[this.expandedFileIdx]?.file;
    if (!fileName) return;
    this.startSpinner();
    try {
      const detailed = await this.fetchDetailedDiagnostics(1);
      const entry = detailed.find((d) => d.file === fileName);
      this.expandedDiagnostics = entry?.diagnostics ?? [];
    } catch {
      this.expandedDiagnostics = [];
    } finally {
      this.stopSpinner();
    }
    this.invalidate();
    this.tui.requestRender();
  }

  // ── Section builders ──────────────────────────────────────────────

  private renderHeader(): string {
    const accent = this.theme.fg("accent", this.theme.bold("◆ Code Intelligence"));
    const hint = this.theme.fg("dim", "  /supi-ci-status toggles · ↑↓ nav · enter expand");
    return truncateToWidth(accent + hint, 1000);
  }

  private renderKeyHints(): string {
    return this.theme.fg("dim", "  r refresh  ·  a collapse all  ·  esc close");
  }

  private renderSummaryLine(width: number): string {
    const t = this.theme;
    const running = this.data.servers.filter((s) => s.status === "running").length;
    const totalErrors = this.data.diagnostics.reduce((sum, d) => sum + d.errors, 0);
    const totalWarnings = this.data.diagnostics.reduce((sum, d) => sum + d.warnings, 0);
    const sep = t.fg("dim", " · ");

    const parts: string[] = [];
    if (running > 0) {
      parts.push(t.fg("text", `${running} server${running === 1 ? "" : "s"}`));
    }
    if (totalErrors > 0) {
      parts.push(t.fg("error", `${totalErrors} error${totalErrors === 1 ? "" : "s"}`));
    }
    if (totalWarnings > 0) {
      parts.push(t.fg("warning", `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`));
    }
    const structKind = this.data.capabilities.structural.kind;
    if (structKind === "ready") parts.push(t.fg("success", "✓ ts ready"));
    else if (structKind === "pending") parts.push(t.fg("dim", "ts pending…"));
    else parts.push(t.fg("error", "ts unavailable"));

    const joined = parts.length > 0 ? parts.join(sep) : t.fg("dim", "(no data)");
    return truncateToWidth(joined, width);
  }

  private addServerSection(container: Container): void {
    const t = this.theme;
    container.addChild(new Text(t.fg("accent", t.bold(" Servers")), 1, 0));
    if (this.data.servers.length === 0) {
      this.addEmptyServerRow(container);
      return;
    }
    for (const server of this.data.servers) {
      this.addServerRow(container, server);
    }
  }

  private addEmptyServerRow(container: Container): void {
    const t = this.theme;
    const sem = this.data.capabilities.semantic;
    if (sem.kind !== "ready") {
      container.addChild(new Text(t.fg("dim", "  no LSP session for this workspace"), 1, 0));
    } else {
      container.addChild(new Text(t.fg("dim", "  no configured language servers"), 1, 0));
    }
  }

  private addServerRow(container: Container, server: ProjectServerInfo): void {
    const t = this.theme;
    const statusColor =
      server.status === "running" ? "success" : server.status === "error" ? "error" : "warning";
    const icon = server.status === "running" ? "✓" : server.status === "error" ? "✗" : "?";

    container.addChild(
      new Text(
        t.fg("accent", "  ▸ ") +
          t.fg("text", server.name) +
          " " +
          t.fg(statusColor, icon) +
          " " +
          t.fg("dim", `root: ${server.root}`),
        0,
        0,
      ),
    );

    const fileTypes = server.fileTypes.map((f) => `.${f}`).join(" ");
    container.addChild(new Text(t.fg("dim", `    files: ${fileTypes || "(none)"}`), 0, 0));

    if (server.openFiles.length > 0) {
      const shown = server.openFiles.slice(0, MAX_OPEN_FILES_SHOWN);
      const remaining = server.openFiles.length - shown.length;
      const suffix = remaining > 0 ? t.fg("dim", ` +${remaining}`) : "";
      container.addChild(new Text(t.fg("dim", `    open: ${shown.join(", ")}`) + suffix, 0, 0));
    } else {
      container.addChild(new Text(t.fg("dim", "    open: (none)"), 0, 0));
    }
  }

  private addProblemsSection(container: Container, width: number): void {
    const t = this.theme;
    container.addChild(new Text(t.fg("accent", t.bold(" Problems")), 1, 0));
    if (this.data.diagnostics.length === 0) {
      this.addEmptyProblemsRow(container);
      return;
    }
    container.addChild(
      new Text(t.fg("dim", "  ↑↓ navigate · enter to expand · single-expand"), 1, 0),
    );

    const visible = this.data.diagnostics.slice(0, MAX_FILES_IN_LIST);
    visible.forEach((entry, idx) => {
      this.addProblemRow(container, entry, idx, width);
    });

    const remaining = this.data.diagnostics.length - visible.length;
    if (remaining > 0) {
      container.addChild(
        new Text(t.fg("dim", `  ↳ +${remaining} more file${remaining === 1 ? "" : "s"}`), 1, 0),
      );
    }
  }

  private addEmptyProblemsRow(container: Container): void {
    const t = this.theme;
    const sem = this.data.capabilities.semantic;
    if (sem.kind !== "ready") {
      container.addChild(new Text(t.fg("dim", "  (LSP not ready)"), 1, 0));
    } else {
      container.addChild(new Text(t.fg("success", "  ✓ no issues"), 1, 0));
    }
  }

  private addProblemRow(
    container: Container,
    entry: OutstandingDiagnosticSummaryEntry,
    idx: number,
    width: number,
  ): void {
    const t = this.theme;
    const isSelected = idx === this.selectedFileIdx;
    const isExpanded = idx === this.expandedFileIdx;

    const counts: string[] = [];
    if (entry.errors > 0) {
      counts.push(t.fg("error", `${entry.errors} error${entry.errors === 1 ? "" : "s"}`));
    }
    if (entry.warnings > 0) {
      counts.push(t.fg("warning", `${entry.warnings} warning${entry.warnings === 1 ? "" : "s"}`));
    }
    const countsText = counts.length > 0 ? `  ${counts.join("  ")}` : "";
    const indicator = isExpanded ? t.fg("accent", "▼") : isSelected ? t.fg("accent", "▶") : " ";
    const fileColor = isSelected ? "accent" : "muted";
    const line = `${indicator} ${t.fg(fileColor, entry.file)}${countsText}`;
    container.addChild(new Text(truncateToWidth(line, width), 0, 0));

    if (isExpanded) {
      this.addInlineDiagnostics(container, width);
    }
  }

  private addInlineDiagnostics(container: Container, width: number): void {
    const t = this.theme;
    if (this.loading) {
      const frame = BRAILLE_SPINNER_FRAMES[this.spinnerFrame] ?? BRAILLE_SPINNER_FRAMES[0];
      container.addChild(new Text(t.fg("accent", `    └ ${frame} loading…`), 0, 0));
      return;
    }
    if (this.expandedDiagnostics === null) {
      container.addChild(new Text(t.fg("dim", "    └ no diagnostics available"), 0, 0));
      return;
    }
    const messages = this.expandedDiagnostics;
    for (const diag of messages.slice(0, MAX_INLINE_MESSAGES)) {
      const lineNum = diag.range.start.line + 1;
      const colNum = diag.range.start.character + 1;
      const sevColor = diag.severity === 1 ? "error" : "warning";
      const messageText = truncateTextForInline(diagnosticMessageString(diag), width - 14);
      const msg = `    ${t.fg(sevColor, "└")} ${lineNum}:${colNum}  ${t.fg("dim", messageText)}`;
      container.addChild(new Text(msg, 0, 0));
    }
    const remaining = messages.length - MAX_INLINE_MESSAGES;
    if (remaining > 0) {
      container.addChild(new Text(t.fg("dim", `    └ +${remaining} more`), 0, 0));
    }
  }

  private addCapabilitiesSection(container: Container): void {
    const t = this.theme;
    container.addChild(new Text(t.fg("accent", t.bold(" Capabilities")), 1, 0));
    this.addCapabilityRow(container, "Semantic    ", this.data.capabilities.semantic);
    this.addCapabilityRow(container, "Structural  ", this.data.capabilities.structural);
    const refLabel = this.data.capabilities.refactorAvailable ? "✓ available" : "✗ unavailable";
    const refColor = this.data.capabilities.refactorAvailable ? "success" : "error";
    container.addChild(
      new Text(`  ${t.fg("text", "Refactor    ")} ${t.fg(refColor, refLabel)}`, 0, 0),
    );
  }

  private addCapabilityRow(
    container: Container,
    label: string,
    cap: { kind: string; reason?: string },
  ): void {
    const t = this.theme;
    const capLabel =
      cap.kind === "ready" ? "✓ ready" : cap.kind === "pending" ? "⏳ pending" : "✗ unavailable";
    const capColor = cap.kind === "ready" ? "success" : cap.kind === "pending" ? "dim" : "error";
    const reason = cap.reason ? t.fg("dim", ` — ${cap.reason}`) : "";
    container.addChild(
      new Text(`  ${t.fg("text", label)} ${t.fg(capColor, capLabel)}${reason}`, 0, 0),
    );
  }

  private addDegradedCoverageSection(container: Container): void {
    const warnings = this.data.degradedCoverage;
    if (!warnings?.hasWarnings) return;

    const t = this.theme;
    container.addChild(new Spacer(1));
    container.addChild(new Text(t.fg("error", t.bold(" Degraded Coverage")), 1, 0));

    for (const w of warnings.warnings) {
      const lang = w.language ? `${t.fg("accent", w.language)} ` : "";
      const detail = w.detail ? t.fg("dim", ` — ${w.detail}`) : "";
      container.addChild(
        new Text(`  ${t.fg("warning", "⚠")} ${lang}${t.fg("dim", w.message)}${detail}`, 0, 0),
      );
    }
    container.addChild(new Spacer(1));
  }

  private addToolsSection(container: Container, width: number): void {
    const t = this.theme;
    if (this.data.activeTools.length === 0) return;
    container.addChild(new Spacer(1));
    container.addChild(new Text(t.fg("accent", t.bold(" Tools")), 1, 0));
    const label = `  ${this.data.activeTools.map((tool) => t.fg("text", tool)).join(t.fg("dim", ", "))}`;
    const truncated = truncateTextForInline(label, width - 4);
    container.addChild(new Text(truncated, 0, 0));
    container.addChild(new Spacer(1));
  }

  private readonly theme: CiDialogTheme;
  private readonly done: () => void;
  private readonly tui: { requestRender: () => void };
  private readonly fetchDetailedDiagnostics?: DiagFetcher;
  private readonly onRefresh?: () => Promise<CiStatusData>;
}

function truncateTextForInline(text: string, maxWidth: number): string {
  if (visibleWidth(text) <= maxWidth) return text;
  return truncateToWidth(text, Math.max(8, maxWidth), "…");
}

/**
 * Factory for use with `ctx.ui.custom()`.
 */
export function createCiStatusDialog(data: CiStatusData, deps: CiStatusDialogDeps): CiStatusDialog {
  return new CiStatusDialog(data, deps);
}
