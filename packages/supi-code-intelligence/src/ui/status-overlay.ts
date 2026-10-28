import { relative, resolve } from "node:path";
import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  getKeybindings,
  Key,
  type KeybindingsManager,
  matchesKey,
  ScrollView,
  Spacer,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { BRAILLE_SPINNER_FRAMES } from "@mrclrchtr/supi-core/spinner-frames";
import type { Diagnostic, ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import {
  countProjectServerRouteStatuses,
  formatProjectServerRoot,
  formatProjectServerStatusReason,
} from "../analysis/health/server-status.ts";
import type { WorkspaceStatusSnapshot } from "../analysis/health/status.ts";
import type { HealthDiagnosticEntry } from "../session/health-types.ts";
import { diagnosticMessageString } from "../substrate/lsp/utils.ts";

/** Passive health facts plus the session's active tool surface. */
export interface CiStatusData extends WorkspaceStatusSnapshot {
  readonly activeTools: readonly string[];
}

/** Full error/warning messages retain freshness independently from the summary. */
export interface CiDiagnosticDetails {
  readonly current: boolean;
  readonly entries: readonly {
    readonly file: string;
    readonly diagnostics: readonly Diagnostic[];
  }[];
}

/** Dependencies owned by one terminal interaction. Reload is passive, not LSP recovery. */
export interface CiStatusDialogDeps {
  theme: Pick<Theme, "fg" | "bold">;
  done: () => void;
  tui: { terminal: { rows: number }; requestRender: () => void };
  keybindings?: KeybindingsManager;
  fetchDetailedDiagnostics?: () => CiDiagnosticDetails | Promise<CiDiagnosticDetails>;
  onRefresh?: () => Promise<CiStatusData>;
}

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; diagnostics: readonly Diagnostic[]; current: boolean }
  | { kind: "error"; message: string };
const MAX_INLINE_MESSAGES = 5;
const MAX_OPEN_FILES_SHOWN = 3;
const FRAME_ROWS = 6;
const STATUS_ACTIONS = [
  "tui.select.cancel",
  "tui.select.up",
  "tui.select.down",
  "tui.select.confirm",
  "tui.select.pageUp",
  "tui.select.pageDown",
] as const;

/** A bounded inspector with file-keyed selection and interaction-local asynchronous work. */
export class CiStatusDialog {
  private selectedFile: string | undefined;
  private expandedFile: string | undefined;
  private details: DetailState | undefined;
  private detailGeneration = 0;
  private refreshGeneration = 0;
  private refreshing = false;
  private refreshError: string | undefined;
  private disposed = false;
  private spinner: ReturnType<typeof setInterval> | undefined;
  private spinnerFrame = 0;
  private cachedWidth: number | undefined;
  private cachedHeight: number | undefined;
  private cachedLines: string[] | undefined;
  private bodyLines: string[] = [];
  private selectedRow = 0;
  private expandedRows = 1;
  private revealSelection = false;
  private readonly scroll = new ScrollView({ render: () => this.bodyLines, invalidate() {} });
  private readonly keybindings: KeybindingsManager;

  constructor(
    private data: CiStatusData,
    private readonly deps: CiStatusDialogDeps,
  ) {
    this.selectedFile = data.diagnostics.entries[0]?.file;
    this.keybindings = deps.keybindings ?? getKeybindings();
  }

  /** Invalidate in-flight work before releasing the spinner and terminal interaction. */
  dispose(): void {
    this.disposed = true;
    this.detailGeneration++;
    this.refreshGeneration++;
    this.stopSpinner();
  }

  render(width: number): string[] {
    const height = Math.max(1, Math.floor(this.deps.tui.terminal.rows * 0.85));
    if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height)
      return this.cachedLines;
    if (height <= FRAME_ROWS)
      return [truncateToWidth(`CI · ${this.keyLabel("tui.select.cancel")} close`, width)];
    const bodyHeight = height - FRAME_ROWS;
    const resized =
      this.cachedHeight !== undefined &&
      (this.cachedHeight !== height || this.cachedWidth !== width);
    this.bodyLines = this.renderBody(width);
    this.scroll.updateLayout(this.bodyLines.length, bodyHeight, () =>
      this.deps.tui.requestRender(),
    );
    if ((this.revealSelection || resized) && this.selectedFile) {
      const end = this.selectedRow + Math.min(this.expandedRows, bodyHeight) - 1;
      if (this.selectedRow < this.scroll.scrollTop) this.scroll.scrollTo(this.selectedRow);
      else if (end >= this.scroll.scrollTop + bodyHeight)
        this.scroll.scrollTo(end - bodyHeight + 1);
    }
    this.revealSelection = false;
    const t = this.deps.theme;
    const border = new DynamicBorder((s) => t.fg("accent", s)).render(width)[0] ?? "";
    const position =
      this.bodyLines.length > bodyHeight
        ? ` · ${this.scroll.scrollTop + 1}–${Math.min(this.scroll.scrollTop + bodyHeight, this.bodyLines.length)}/${this.bodyLines.length}`
        : "";
    // Pi's overlay adapter only calls render(width), not the fullscreen layout engine.
    // ScrollView owns offsets/clamping; apply its viewport explicitly for this adapter.
    const lines = [
      border,
      t.fg("accent", t.bold("◆ Code Intelligence")) + t.fg("dim", " · /supi-ci-status"),
      this.summaryLine(),
      ...this.scroll.render(width).slice(this.scroll.scrollTop, this.scroll.scrollTop + bodyHeight),
      t.fg("dim", this.controlHints()),
      t.fg(
        "dim",
        `${this.keyLabel("tui.select.up")}/${this.keyLabel("tui.select.down")} files · ${this.keyLabel("tui.select.pageUp")}/${this.keyLabel("tui.select.pageDown")} scroll · home/end${position}`,
      ),
      border,
    ].map((line) => truncateToWidth(line, width));
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedLines = undefined;
  }

  handleInput(input: string): boolean {
    if (this.disposed) return false;
    if (this.keybindings.matches(input, "tui.select.cancel")) {
      this.dispose();
      this.deps.done();
      return true;
    }
    return (
      this.handleScrollInput(input) ||
      this.handleFileInput(input) ||
      this.handleShortcutInput(input)
    );
  }

  private handleShortcutInput(input: string): boolean {
    if (input === "r" && this.deps.onRefresh) {
      void this.reload();
      return true;
    }
    if (input === "a") {
      this.collapse();
      this.changed();
      return true;
    }
    if (input === "j" || input === "k") return this.moveSelection(input === "k" ? -1 : 1);
    if (matchesKey(input, Key.home)) this.scroll.scrollToStart();
    else if (matchesKey(input, Key.end)) this.scroll.scrollToEnd();
    else return false;
    this.changed();
    return true;
  }

  private handleScrollInput(input: string): boolean {
    const pageUp = this.keybindings.matches(input, "tui.select.pageUp");
    const pageDown = this.keybindings.matches(input, "tui.select.pageDown");
    if (pageUp || pageDown) {
      this.scroll.scrollBy((pageUp ? -1 : 1) * Math.max(1, this.scroll.viewportHeight - 1));
    } else {
      return false;
    }
    this.changed();
    return true;
  }

  private handleFileInput(input: string): boolean {
    const up = this.keybindings.matches(input, "tui.select.up");
    const down = this.keybindings.matches(input, "tui.select.down");
    if (up || down) return this.moveSelection(up ? -1 : 1);
    if (this.keybindings.matches(input, "tui.select.confirm") || matchesKey(input, Key.space)) {
      if (!this.selectedFile) return true;
      if (this.expandedFile === this.selectedFile) this.collapse();
      else {
        this.collapse();
        this.expandedFile = this.selectedFile;
        void this.loadDetails(this.selectedFile);
      }
      this.revealSelection = true;
      this.changed();
      return true;
    }
    return false;
  }

  private moveSelection(direction: number): boolean {
    const files = this.data.diagnostics.entries;
    const index = files.findIndex((entry) => entry.file === this.selectedFile);
    const next = files[Math.max(0, Math.min(files.length - 1, index + direction))];
    if (next) this.selectedFile = next.file;
    this.revealSelection = true;
    this.changed();
    return true;
  }

  private collapse(): void {
    this.detailGeneration++;
    this.expandedFile = undefined;
    this.details = undefined;
    this.updateSpinner();
  }

  private async loadDetails(file: string): Promise<void> {
    const fetch = this.deps.fetchDetailedDiagnostics;
    if (!fetch) {
      this.details = { kind: "error", message: "Diagnostic details are unavailable" };
      return;
    }
    const generation = ++this.detailGeneration;
    this.details = { kind: "loading" };
    this.changed();
    try {
      const result = await fetch();
      if (this.disposed || generation !== this.detailGeneration) return;
      const entry = result.entries.find(
        (entry) =>
          resolve(this.data.workspaceRoot, entry.file) === resolve(this.data.workspaceRoot, file),
      );
      this.details = {
        kind: "ready",
        diagnostics: entry?.diagnostics ?? [],
        current: result.current,
      };
    } catch (error) {
      if (this.disposed || generation !== this.detailGeneration) return;
      this.details = { kind: "error", message: errorText(error) };
    }
    if (!this.disposed && generation === this.detailGeneration) this.changed();
  }

  private async reload(): Promise<void> {
    if (this.refreshing || !this.deps.onRefresh) return;
    const generation = ++this.refreshGeneration;
    this.refreshing = true;
    this.refreshError = undefined;
    this.collapse();
    this.changed();
    try {
      const data = await this.deps.onRefresh();
      if (this.disposed || generation !== this.refreshGeneration) return;
      this.data = data;
      if (!data.diagnostics.entries.some((entry) => entry.file === this.selectedFile))
        this.selectedFile = data.diagnostics.entries[0]?.file;
      this.collapse();
      this.revealSelection = true;
    } catch (error) {
      if (this.disposed || generation !== this.refreshGeneration) return;
      this.refreshError = errorText(error);
    }
    if (!this.disposed && generation === this.refreshGeneration) {
      this.refreshing = false;
      this.changed();
    }
  }

  private changed(): void {
    if (this.disposed) return;
    this.updateSpinner();
    this.invalidate();
    this.deps.tui.requestRender();
  }

  private updateSpinner(): void {
    if (this.disposed || (!this.refreshing && this.details?.kind !== "loading")) {
      this.stopSpinner();
      return;
    }
    if (this.spinner) return;
    this.spinner = setInterval(() => {
      this.spinnerFrame++;
      this.invalidate();
      this.deps.tui.requestRender();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinner) clearInterval(this.spinner);
    this.spinner = undefined;
  }

  private summaryLine(): string {
    const t = this.deps.theme;
    if (this.refreshError) return t.fg("error", `Reload failed: ${this.refreshError}`);
    const ready = this.data.servers.filter(
      (server) => server.status === "running" && server.ready,
    ).length;
    const starting = this.data.servers.filter(
      (server) => server.status === "running" && !server.ready,
    ).length;
    const counts = countProjectServerRouteStatuses(this.data.servers);
    const entries = this.data.diagnostics.entries;
    const errors = entries.reduce((sum, entry) => sum + entry.errors, 0);
    const warnings = entries.reduce((sum, entry) => sum + entry.warnings, 0);
    return [
      `${ready} ready${starting ? ` · ${starting} starting` : ""}`,
      errors ? t.fg("error", countLabel(errors, "error")) : "",
      warnings ? t.fg("warning", countLabel(warnings, "warning")) : "",
      counts.recovering
        ? t.fg(
            "warning",
            `${counts.recovering} route${counts.recovering === 1 ? "" : "s"} recovering`,
          )
        : "",
      counts.error ? t.fg("error", countLabel(counts.error, "route error")) : "",
      counts.unavailable ? t.fg("warning", `${counts.unavailable} routes unavailable`) : "",
      this.data.diagnostics.kind === "partial" ? t.fg("warning", "partial snapshot") : "",
      this.refreshing ? t.fg("accent", `${this.frame()} reloading…`) : "",
    ]
      .filter(Boolean)
      .join(t.fg("dim", " · "));
  }

  private renderBody(width: number): string[] {
    const t = this.deps.theme;
    const body = new Container();
    const text = (value: string) => body.addChild(new Text(value, 0, 0));
    const heading = (value: string) => text(t.fg("accent", t.bold(value)));
    heading("Capabilities");
    this.addCapabilities(text);
    body.addChild(new Spacer(1));
    heading("Problems · tracked-file snapshot (not a workspace-wide check)");
    this.addProblems(body, width, text);
    body.addChild(new Spacer(1));
    heading("Servers");
    this.addServers(text);
    if (this.data.capabilityWarnings?.hasWarnings) {
      body.addChild(new Spacer(1));
      heading("Capability Warnings");
      this.addWarnings(text);
    }
    if (this.data.activeTools.length) {
      body.addChild(new Spacer(1));
      heading("Tools");
      text(this.data.activeTools.join(", "));
    }
    return body.render(width);
  }

  private addCapabilities(text: (value: string) => void): void {
    const t = this.deps.theme;
    for (const [label, state] of Object.entries(this.data.capabilities)) {
      const color =
        state.kind === "ready" ? "success" : state.kind === "unavailable" ? "error" : "dim";
      const reason = "reason" in state ? ` — ${state.reason}` : "";
      text(
        t.fg(
          color,
          `  ${label === "semantic" ? "Semantic" : "Structural"}: ${state.kind}${reason}`,
        ),
      );
    }
    text(t.fg("dim", "  Refactor: negotiated per route; see Servers"));
  }

  private addProblems(body: Container, width: number, text: (value: string) => void): void {
    this.addDiagnosticEvidence(text);
    if (this.refreshError) text(this.deps.theme.fg("error", `Reload failed: ${this.refreshError}`));
    this.selectedRow = 0;
    this.expandedRows = 1;
    for (const entry of this.data.diagnostics.entries) this.addProblemRow(entry, body, width);
  }

  private addProblemRow(entry: HealthDiagnosticEntry, body: Container, width: number): void {
    const text = (value: string) => body.addChild(new Text(value, 0, 0));
    if (entry.file === this.selectedFile) this.selectedRow = body.render(width).length;
    const indicator =
      entry.file === this.expandedFile ? "▼" : entry.file === this.selectedFile ? "▶" : " ";
    const label = relative(
      this.data.workspaceRoot,
      resolve(this.data.workspaceRoot, entry.file),
    ).replaceAll("\\", "/");
    text(`${indicator} ${label}  ${problemCounts(entry)}`);
    if (entry.file === this.selectedFile)
      this.expandedRows = body.render(width).length - this.selectedRow;
    if (entry.file === this.expandedFile) {
      const start = body.render(width).length;
      this.addDetails(text);
      if (entry.file === this.selectedFile) this.expandedRows += body.render(width).length - start;
    }
  }

  private addServers(text: (value: string) => void): void {
    const t = this.deps.theme;
    if (!this.data.serverInventoryAvailable) {
      text(t.fg("dim", "  server inventory unavailable"));
    } else if (!this.data.servers.length) {
      text(
        t.fg(
          "dim",
          this.data.capabilities.semantic.kind === "disabled"
            ? "  all language servers disabled"
            : "  no active project servers; routes may start lazily",
        ),
      );
    }
    for (const server of this.data.servers) this.addServer(server, text);
  }

  private addWarnings(text: (value: string) => void): void {
    for (const warning of this.data.capabilityWarnings?.warnings ?? []) {
      const language = warning.language ? `${warning.language}: ` : "";
      const detail = warning.detail ? ` — ${warning.detail}` : "";
      text(this.deps.theme.fg("warning", `⚠ ${language}${warning.message}${detail}`));
    }
  }

  private addDiagnosticEvidence(text: (value: string) => void): void {
    const observation = this.data.diagnostics;
    const t = this.deps.theme;
    if (observation.kind === "not-requested") return;
    const evidence = observation.evidence;
    text(
      t.fg(
        "dim",
        `  ${evidence.confirmed}/${evidence.requested} confirmed tracked files · ${evidence.unconfirmed} unconfirmed · ${evidence.failed} failed · ${evidence.removed} removed`,
      ),
    );
    if (observation.kind === "unavailable")
      text(t.fg("warning", `  diagnostics unavailable — ${observation.reason}`));
    else if (observation.kind === "partial")
      text(t.fg("warning", `  diagnostic snapshot is stale or incomplete — ${observation.reason}`));
    else if (evidence.confirmed === 0)
      text(
        t.fg(
          "dim",
          "  No confirmed tracked files; an empty result does not establish a clean workspace.",
        ),
      );
    else if (!observation.entries.length)
      text(t.fg("success", `  ✓ no issues in ${evidence.confirmed} confirmed tracked files`));
  }

  private addDetails(text: (value: string) => void): void {
    const t = this.deps.theme;
    const details = this.details;
    if (!details) return;
    if (details.kind === "loading") {
      text(t.fg("accent", `    ${this.frame()} loading…`));
      return;
    }
    if (details.kind === "error") {
      text(t.fg("error", `    Details unavailable: ${details.message}`));
      return;
    }
    if (!details.current) text(t.fg("warning", "    Diagnostic details are stale"));
    if (!details.diagnostics.length)
      text(t.fg("dim", "    No error or warning messages in this snapshot"));
    for (const diagnostic of details.diagnostics.slice(0, MAX_INLINE_MESSAGES)) {
      text(
        t.fg(
          diagnostic.severity === 1 ? "error" : "warning",
          `    ${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${diagnosticMessageString(diagnostic)}`,
        ),
      );
    }
    if (details.diagnostics.length > MAX_INLINE_MESSAGES)
      text(t.fg("dim", `    +${details.diagnostics.length - MAX_INLINE_MESSAGES} more messages`));
  }

  private addServer(server: ProjectServerInfo, text: (value: string) => void): void {
    const t = this.deps.theme;
    const state =
      server.status === "running" ? (server.ready ? "ready" : "starting") : server.status;
    text(
      t.fg(
        state === "ready" ? "success" : state === "error" ? "error" : "warning",
        `  ${server.name}: ${state} · root: ${formatProjectServerRoot(this.data.workspaceRoot, server.root)}`,
      ),
    );
    text(
      t.fg("dim", `    files: ${server.fileTypes.map((type) => `.${type}`).join(" ") || "(none)"}`),
    );
    const reason = formatProjectServerStatusReason(server.statusReason);
    if (reason) text(t.fg("warning", `    ${reason}`));
    const shown = server.openFiles.slice(0, MAX_OPEN_FILES_SHOWN);
    text(
      t.fg(
        "dim",
        `    open: ${shown.join(", ") || "(none)"}${server.openFiles.length > shown.length ? ` +${server.openFiles.length - shown.length} more` : ""}`,
      ),
    );
    this.addOperationSupport(server, text);
  }

  private addOperationSupport(server: ProjectServerInfo, text: (value: string) => void): void {
    const t = this.deps.theme;
    if (!server.operationSupport || !Object.keys(server.operationSupport).length)
      text(t.fg("dim", "    Refactor support: not negotiated"));
    for (const [operation, support] of Object.entries(server.operationSupport ?? {})) {
      text(
        t.fg(
          "dim",
          `    ${operation}: server ${support.server}; SuPi ${support.supi}${support.reason ? ` — ${support.reason}` : ""}`,
        ),
      );
    }
  }

  private controlHints(): string {
    const reserved = (key: string) =>
      STATUS_ACTIONS.some((action) => this.keybindings.matches(key, action));
    return [
      `${this.keyLabel("tui.select.cancel")} close`,
      `${this.keyLabel("tui.select.confirm")} expand`,
      this.deps.onRefresh && !reserved("r") ? "r reload" : "",
      !reserved("a") ? "a collapse" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private keyLabel(action: Parameters<KeybindingsManager["getKeys"]>[0]): string {
    const key = this.keybindings.getKeys(action)[0];
    const labels: Record<string, string> = {
      escape: "esc",
      up: "↑",
      down: "↓",
      pageUp: "PgUp",
      pageDown: "PgDn",
    };
    return key ? (labels[key] ?? key) : "unbound";
  }

  private frame(): string {
    return BRAILLE_SPINNER_FRAMES[this.spinnerFrame % BRAILLE_SPINNER_FRAMES.length] ?? "…";
  }
}

function problemCounts(entry: HealthDiagnosticEntry): string {
  return [
    entry.errors ? countLabel(entry.errors, "error") : "",
    entry.warnings ? countLabel(entry.warnings, "warning") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function countLabel(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Construct a fresh, disposable inspector for ctx.ui.custom(). */
export function createCiStatusDialog(data: CiStatusData, deps: CiStatusDialogDeps): CiStatusDialog {
  return new CiStatusDialog(data, deps);
}
