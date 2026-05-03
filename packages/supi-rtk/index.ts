import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createLocalBashOperations,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import {
  loadSupiConfig,
  registerConfigSettings,
  registerContextProvider,
} from "@mrclrchtr/supi-core";
import { rtkRewrite } from "./rewrite.ts";
import { getStats, recordFallback, recordRewrite, resetTracking } from "./tracking.ts";

const RTK_SECTION = "rtk";
const RTK_DEFAULTS = {
  enabled: true,
  rewriteTimeout: 5000,
};

/** Cached RTK availability probe — reset when the extension/session starts. */
let rtkAvailable: boolean | null = null;
let warnedAboutUnavailableRtk = false;

interface RtkUiContext {
  hasUI: boolean;
  ui: {
    notify(message: string, severity: "info" | "warning" | "error"): void;
  };
}

type RtkRewriteResolution =
  | { kind: "disabled" | "unavailable" | "failed" | "unchanged"; command: string }
  | { kind: "rewritten"; command: string };

function checkRtkAvailable(): boolean {
  if (rtkAvailable !== null) {
    return rtkAvailable;
  }

  try {
    execFileSync("rtk", ["--version"], { encoding: "utf-8", timeout: 5000 });
    rtkAvailable = true;
  } catch {
    rtkAvailable = false;
  }

  return rtkAvailable;
}

function loadRtkConfig(cwd: string) {
  return loadSupiConfig(RTK_SECTION, cwd, RTK_DEFAULTS);
}

/** Register RTK settings with the supi settings registry. */
function registerRtkSettings(): void {
  registerConfigSettings({
    id: "rtk",
    label: "RTK",
    section: RTK_SECTION,
    defaults: RTK_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "enabled",
        label: "Enabled",
        description: "Enable/disable RTK bash command rewriting",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "rewriteTimeout",
        label: "Rewrite Timeout",
        description: "Timeout in ms for rtk rewrite calls",
        currentValue: String(settings.rewriteTimeout),
        values: ["1000", "3000", "5000", "10000"],
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      if (settingId === "enabled") {
        helpers.set("enabled", value === "on");
      } else if (settingId === "rewriteTimeout") {
        const num = Number.parseInt(value, 10);
        helpers.set("rewriteTimeout", Number.isNaN(num) ? 5000 : num);
      }
    },
  });
}

function notifyUnavailableRtkOnce(ctx?: RtkUiContext): void {
  if (!ctx?.hasUI || warnedAboutUnavailableRtk) {
    return;
  }

  warnedAboutUnavailableRtk = true;
  ctx.ui.notify(
    "RTK is enabled but the rtk binary is not available on PATH. Falling back to normal bash execution.",
    "warning",
  );
}

/**
 * Resolve the command RTK should execute for the given cwd.
 * Records rewrite/fallback stats and optionally warns once per session when RTK is unavailable.
 */
function resolveRtkCommand(command: string, cwd: string, ctx?: RtkUiContext): RtkRewriteResolution {
  const config = loadRtkConfig(cwd);
  if (!config.enabled) {
    return { kind: "disabled", command };
  }

  if (!checkRtkAvailable()) {
    notifyUnavailableRtkOnce(ctx);
    return { kind: "unavailable", command };
  }

  const rewritten = rtkRewrite(command, config.rewriteTimeout);
  if (!rewritten) {
    recordFallback(command);
    return { kind: "failed", command };
  }

  if (rewritten === command) {
    return { kind: "unchanged", command };
  }

  recordRewrite(command, rewritten);
  return { kind: "rewritten", command: rewritten };
}

function createRtkAwareBashTool(cwd: string, ctx?: RtkUiContext) {
  const settings = SettingsManager.create(cwd);
  return createBashTool(cwd, {
    shellPath: settings.getShellPath(),
    commandPrefix: settings.getShellCommandPrefix(),
    spawnHook: ({ command, cwd: spawnCwd, env }) => {
      const resolution = resolveRtkCommand(command, spawnCwd, ctx);
      return { command: resolution.command, cwd: spawnCwd, env };
    },
  });
}

export default function rtkExtension(pi: ExtensionAPI) {
  rtkAvailable = null;
  warnedAboutUnavailableRtk = false;
  registerRtkSettings();

  registerContextProvider({
    id: "rtk",
    label: "RTK",
    getData: getStats,
  });

  pi.on("session_start", async () => {
    resetTracking();
    rtkAvailable = null;
    warnedAboutUnavailableRtk = false;
  });

  // Reuse the built-in bash tool metadata/renderers; actual execution uses ctx.cwd per call.
  const baseBashTool = createBashTool(process.cwd());

  pi.registerTool({
    ...baseBashTool,
    // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const bashTool = createRtkAwareBashTool(ctx.cwd, ctx);
      return bashTool.execute(toolCallId, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", (event, ctx) => {
    if (event.excludeFromContext) {
      return;
    }

    const resolution = resolveRtkCommand(event.command, event.cwd, ctx);
    if (resolution.kind !== "rewritten") {
      return;
    }

    const settings = SettingsManager.create(event.cwd);
    const local = createLocalBashOperations({ shellPath: settings.getShellPath() });
    return {
      operations: {
        exec: (_command, cwd, options) => local.exec(resolution.command, cwd, options),
      },
    };
  });
}
