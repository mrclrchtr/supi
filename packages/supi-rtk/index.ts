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

function verifyRtkBinary(): void {
  try {
    execFileSync("rtk", ["--version"], { encoding: "utf-8", timeout: 5000 });
  } catch (_error) {
    throw new Error("rtk binary not found on PATH. Install RTK to use supi-rtk.", {
      cause: _error,
    });
  }
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

export default function rtkExtension(pi: ExtensionAPI) {
  verifyRtkBinary();
  registerRtkSettings();

  registerContextProvider({
    id: "rtk",
    label: "RTK",
    getData: getStats,
  });

  pi.on("session_start", async () => {
    resetTracking();
  });

  const cwd = process.cwd();
  const settings = SettingsManager.create(cwd);
  const shellPath = settings.getShellPath();
  const shellCommandPrefix = settings.getShellCommandPrefix();

  const bashTool = createBashTool(cwd, {
    shellPath,
    commandPrefix: shellCommandPrefix,
    spawnHook: ({ command, cwd: spawnCwd, env }) => {
      const config = loadRtkConfig(spawnCwd);
      if (!config.enabled) {
        return { command, cwd: spawnCwd, env };
      }

      const rewritten = rtkRewrite(command, config.rewriteTimeout);
      if (rewritten && rewritten !== command) {
        recordRewrite(command, rewritten);
        return { command: rewritten, cwd: spawnCwd, env };
      }
      if (!rewritten) {
        recordFallback(command);
      }
      return { command, cwd: spawnCwd, env };
    },
  });

  pi.registerTool({
    ...bashTool,
    // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
    execute: async (id, params, signal, onUpdate, _ctx) => {
      return bashTool.execute(id, params, signal, onUpdate);
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

    const rewritten = rtkRewrite(event.command, config.rewriteTimeout);
    if (!rewritten || rewritten === event.command) {
      if (!rewritten) {
        recordFallback(event.command);
      }
      return;
    }

    recordRewrite(event.command, rewritten);
    const local = createLocalBashOperations({ shellPath });
    return {
      operations: {
        exec: (_command, cwd, options) => local.exec(rewritten, cwd, options),
      },
    };
  });
}
