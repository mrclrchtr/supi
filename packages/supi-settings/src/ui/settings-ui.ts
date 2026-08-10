// Declarative settings overlay for SuPi extensions.
//
// Thin orchestration layer that collects settings contributions and opens the
// scoped settings list inside a pi-tui custom component overlay.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Text } from "@earendil-works/pi-tui";
import {
  createSettingsContributionCollector,
  type SettingsCollectionDiagnostic,
  type SettingsScope,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { ScopedSettingsList } from "./scoped-settings-list.ts";

// ── Overlay ────────────────────────────────────────────────────────────────

interface OverlayStatus {
  kind: "warning" | "error";
  message: string;
}

interface OverlayState {
  scope: SettingsScope;
  cwd: string;
  status?: OverlayStatus;
}

function getScopeLabel(scope: SettingsScope): string {
  return scope === "project" ? "Project" : "Global";
}

function collectSettingsSections(pi: ExtensionAPI) {
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  return collector.result();
}

function latestStatus(diagnostics: SettingsCollectionDiagnostic[]): OverlayStatus | undefined {
  const latest = diagnostics.at(-1);
  return latest ? { kind: latest.kind, message: latest.message } : undefined;
}

export function openSettingsOverlay(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const collection = collectSettingsSections(pi);
  if (collection.sections.length === 0) {
    ctx.ui.notify("No settings registered by SuPi extensions", "info");
    return;
  }

  void ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const state: OverlayState = {
      scope: "project",
      cwd: ctx.cwd,
      status: latestStatus(collection.diagnostics),
    };

    const container = new Container();
    const scopedList = new ScopedSettingsList(
      collection.sections,
      state.scope,
      state.cwd,
      ctx,
      theme,
      tui,
      done,
      (message) => {
        state.status = { kind: "error", message };
        rebuildOverlay();
        tui.requestRender();
      },
    );
    scopedList.enableSearch();

    const rebuildOverlay = () => {
      container.clear();
      const scopeLabel = getScopeLabel(state.scope);
      const otherScope = state.scope === "project" ? "Global" : "Project";
      container.addChild(
        new Text(
          `${theme.fg("accent", theme.bold("SuPi Settings"))}  ${theme.fg("text", `Scope: ${scopeLabel}`)} ${theme.fg("dim", `(tab → ${otherScope})`)}`,
          0,
          0,
        ),
      );
      if (state.status) {
        container.addChild(new Text(theme.fg(state.status.kind, state.status.message), 0, 0));
      }
    };

    rebuildOverlay();

    const component = {
      render: (width: number) => [...container.render(width), ...scopedList.render(width)],
      invalidate: () => {
        container.invalidate();
        scopedList.invalidate();
      },
      handleInput: (data: string) => {
        if (matchesKey(data, Key.tab)) {
          state.scope = state.scope === "project" ? "global" : "project";
          state.status = undefined;
          scopedList.reload(state.scope, state.cwd, ctx);
          rebuildOverlay();
          tui.requestRender();
          return true;
        }
        scopedList.handleInput(data);
        tui.requestRender();
        return true;
      },
    };

    return component;
  });
}
