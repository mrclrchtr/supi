import type { SettingItem } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import { registerConfigSettings } from "@mrclrchtr/supi-core";
import { BASH_TIMEOUT_DEFAULTS, type BashTimeoutConfig } from "./config.ts";

export function registerBashTimeoutSettings(): void {
  registerConfigSettings({
    id: "bash-timeout",
    label: "Bash Timeout",
    section: "bash-timeout",
    defaults: BASH_TIMEOUT_DEFAULTS,
    buildItems: (settings) => buildBashTimeoutSettingItems(settings),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      if (settingId === "defaultTimeout") {
        const num = Number.parseInt(value, 10);
        if (Number.isFinite(num) && num > 0) {
          helpers.set("defaultTimeout", num);
        } else {
          helpers.unset("defaultTimeout");
        }
      }
    },
  });
}

function buildBashTimeoutSettingItems(settings: BashTimeoutConfig): SettingItem[] {
  return [
    {
      id: "defaultTimeout",
      label: "Default Timeout",
      description: "Default timeout for bash tool calls in seconds",
      currentValue: String(settings.defaultTimeout),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "Timeout in seconds:", done),
    },
  ];
}

function createInputSubmenu(
  currentValue: string,
  label: string,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const input = new Input();
  input.setValue(currentValue);

  return {
    render: (_width: number) => {
      const lines = [`  ${label}`];
      lines.push(...input.render(_width));
      lines.push("  enter confirm • esc cancel");
      return lines;
    },
    invalidate: () => {
      input.invalidate();
    },
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        done();
        return true;
      }
      if (matchesKey(data, Key.enter)) {
        done(input.getValue());
        return true;
      }
      input.handleInput(data);
      return true;
    },
  };
}
