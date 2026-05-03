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

/**
 * Try to rewrite a command through RTK, recording the outcome.
 * Returns the rewritten command, or the original when unavailable or unchanged.
 */
function tryRtkRewrite(command: string, timeoutMs: number): string {
  if (!checkRtkAvailable()) {
    return command;
  }

  const rewritten = rtkRewrite(command, timeoutMs);
  if (!rewritten || rewritten === command) {
    if (!rewritten) {
      recordFallback(command);
    }
    return command;
  }

  recordRewrite(command, rewritten);
  return rewritten;
}

export default function rtkExtension(pi: ExtensionAPI) {
  rtkAvailable = null;
  registerRtkSettings();

  registerContextProvider({
    id: "rtk",
    label: "RTK",
    getData: getStats,
  });

  pi.on("session_start", async () => {
    resetTracking();
    rtkAvailable = null;
  });

  const baseBashTool = createBashTool(process.cwd());

  pi.registerTool({
    ...baseBashTool,
    // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const cwd = ctx.cwd;
      const settings = SettingsManager.create(cwd);
      const bashTool = createBashTool(cwd, {
        shellPath: settings.getShellPath(),
        commandPrefix: settings.getShellCommandPrefix(),
        spawnHook: ({ command, cwd: spawnCwd, env }) => {
          const config = loadRtkConfig(spawnCwd);
          if (!config.enabled) {
            return { command, cwd: spawnCwd, env };
          }

          const rewritten = tryRtkRewrite(command, config.rewriteTimeout);
          return { command: rewritten, cwd: spawnCwd, env };
        },
      });
      return bashTool.execute(toolCallId, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", (event) => {
    if (event.excludeFromContext) {
      return;
    }

    const config = loadRtkConfig(event.cwd);
    if (!config.enabled) {
      return;
    }

    const rewritten = tryRtkRewrite(event.command, config.rewriteTimeout);
    if (rewritten === event.command) {
      return;
    }

    const settings = SettingsManager.create(event.cwd);
    const local = createLocalBashOperations({ shellPath: settings.getShellPath() });
    return {
      operations: {
        exec: (_command, cwd, options) => local.exec(rewritten, cwd, options),
      },
    };
  });
}
