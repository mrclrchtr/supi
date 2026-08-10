// Declarative settings screen for SuPi extensions.

import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Text } from "@earendil-works/pi-tui";
import {
  createSettingsContributionCollector,
  type SettingsCollectionDiagnostic,
  type SettingsScope,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { ScopedSettingsList } from "./scoped-settings-list.ts";
import { readSettingsModules } from "./settings-module-reader.ts";

interface OverlayStatus {
  kind: "warning" | "error";
  message: string;
}

interface OverlayState {
  scope: SettingsScope;
  cwd: string;
  status?: OverlayStatus;
}

function collectSettingsModules(pi: ExtensionAPI) {
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  return collector.result();
}

function latestStatus(diagnostics: SettingsCollectionDiagnostic[]): OverlayStatus | undefined {
  const latest = diagnostics.at(-1);
  return latest ? { kind: latest.kind, message: latest.message } : undefined;
}

export async function openSettingsOverlay(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const collection = collectSettingsModules(pi);
  if (collection.modules.length === 0) {
    ctx.ui.notify("No settings registered by SuPi extensions", "info");
    return;
  }

  const initial = await readSettingsModules(collection.modules, {
    scope: "project",
    cwd: ctx.cwd,
    ctx,
  });
  const initialError = initial.errors.at(-1);
  void ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const state: OverlayState = {
      scope: "project",
      cwd: ctx.cwd,
      status: initialError
        ? { kind: "error", message: initialError }
        : latestStatus(collection.diagnostics),
    };

    const container = new Container();
    const scopedList = new ScopedSettingsList(
      collection.modules,
      initial.loaded,
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
      const scope = (label: string, value: SettingsScope) =>
        value === state.scope
          ? theme.fg("accent", theme.bold(`[${label}]`))
          : theme.fg("dim", label);
      container.addChild(new DynamicBorder((text: string) => theme.fg("borderMuted", text)));
      container.addChild(
        new Text(
          `${theme.fg("accent", theme.bold("SuPi Settings"))}  ${theme.fg("dim", "Scope")}  ${scope("Project", "project")}  ${scope("Global", "global")}`,
          1,
          0,
        ),
      );
      if (state.status) {
        container.addChild(new Text(theme.fg(state.status.kind, state.status.message), 1, 0));
      }
      container.addChild(scopedList);
      container.addChild(new DynamicBorder((text: string) => theme.fg("borderMuted", text)));
    };

    rebuildOverlay();

    const component = {
      render: (width: number) => container.render(width),
      invalidate: () => {
        rebuildOverlay();
        container.invalidate();
      },
      handleInput: (data: string) => {
        if (matchesKey(data, Key.tab) && !scopedList.hasOpenSubmenu()) {
          state.scope = state.scope === "project" ? "global" : "project";
          state.status = undefined;
          void scopedList.reload(state.scope, state.cwd, ctx).then(() => {
            rebuildOverlay();
            tui.requestRender();
          });
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
